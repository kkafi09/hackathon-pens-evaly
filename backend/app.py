import csv
import io
import json
import os
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .analysis import Analyzer, RunStore
from .data import Dataset
from .provenance import gateway
from .explanations import explain_run
from .database import engine, active, datasets, records, readiness, REVISION
from sqlalchemy import select, func, text
from .database import runs
from threading import RLock

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')


_dataset_cache = {}
_dataset_lock = RLock()

def dataset():
    try:
        with engine().connect() as connection:
            if connection.execute(text('SELECT version_num FROM alembic_version')).scalar() != REVISION:
                raise ValueError('Schema belum sesuai.')
            digest = connection.execute(select(active.c.dataset_hash).where(active.c.id == 1)).scalar()
            if not digest:
                raise ValueError('Dataset belum diimpor.')
            with _dataset_lock:
                if digest not in _dataset_cache:
                    version = connection.execute(select(datasets).where(datasets.c.hash == digest)).mappings().one()
                    tables = {}
                    for row in connection.execute(select(records.c.table_name, records.c.payload).where(records.c.dataset_hash == digest).order_by(records.c.table_name, records.c.row_index)):
                        tables.setdefault(row.table_name, []).append(row.payload)
                    prepared = Dataset.from_records(tables, digest, version['warnings'])
                    _dataset_cache.clear()
                    _dataset_cache[digest] = prepared
                return _dataset_cache[digest]
    except Exception:
        raise HTTPException(503, 'Data belum siap. Periksa MySQL, jalankan migration dan seeder dari container backend.') from None


@lru_cache
def store():
    try:
        return RunStore()
    except Exception:
        raise HTTPException(503, 'Penyimpanan belum siap. Jalankan migration MySQL.') from None


@asynccontextmanager
async def lifespan(app):
    yield


app = FastAPI(title='Evaly Context Graph', lifespan=lifespan)


def account(aid):
    if aid not in dataset().accounts:
        raise HTTPException(404, 'Akun tidak ditemukan')
    return dataset().accounts[aid]


def get_run(rid):
    run = store().get(rid)
    if not run:
        raise HTTPException(404, 'Hasil tidak ditemukan')
    run['gateway'] = gateway(run)
    run['stale'] = run['dataset_hash'] != dataset().hash
    return run if 'review_reasons' in run and 'next_steps' in run else explain_run(run)


@app.get('/api/health')
def health():
    return {'status': 'ok', 'jev_configured': bool(os.environ.get('OPENROUTER_API_KEY', '').strip()), 'gateway': 'openrouter', 'configured_model': os.environ.get('OPENROUTER_MODEL', '~typesafe/jev-latest')}


@app.get('/api/health/live')
def live():
    return {'status': 'ok'}


@app.get('/api/health/ready')
def ready():
    components = readiness()
    result = {'status': 'ready' if all(components.values()) else 'not_ready', 'components': components}
    if all(components.values()):
        try:
            with engine(True).connect() as connection:
                result['active_runs'] = connection.execute(select(func.count()).select_from(runs).where(runs.c.status.in_(['waiting', 'running']))).scalar()
        except Exception:
            result['status'] = 'not_ready'
            components['database'] = False
    return JSONResponse(result, status_code=200 if all(components.values()) else 503)


@app.get('/api/graph')
def graph(account_id: str | None = None):
    if account_id:
        account(account_id)
    return dataset().graph(account_id)


@app.get('/api/accounts/{aid}/context')
def context(aid: str):
    account(aid)
    return dataset().context(aid)


@app.post('/api/accounts/{aid}/expansion-runs', status_code=202)
def start(aid: str, tasks: BackgroundTasks):
    if account(aid)['tipe'] != 'pelanggan':
        raise HTTPException(422, 'Analisis ini untuk pelanggan existing')
    existing = store().list(aid, dataset().hash)
    running = next((r for r in existing if r['status'] in ('waiting', 'running')), None)
    if running:
        return get_run(running['id'])
    run = store().create(aid, dataset().hash)
    tasks.add_task(Analyzer(dataset(), store()).execute, run)
    return run


@app.get('/api/accounts/{aid}/expansion-runs')
def history(aid: str):
    account(aid)
    return store().list(aid, dataset().hash)


@app.get('/api/expansion-runs/{rid}')
def status(rid: str):
    return get_run(rid)


@app.delete('/api/expansion-runs/{rid}', status_code=204)
def delete_run(rid: str):
    outcome = store().delete(rid)
    if outcome == 'missing':
        raise HTTPException(404, 'Hasil tidak ditemukan; riwayat mungkin sudah berubah.')
    if outcome == 'active':
        raise HTTPException(409, 'Analisis masih menunggu atau berjalan dan tidak dapat dihapus.')
    return Response(status_code=204)


@app.get('/api/expansion-runs/{rid}/export/{format}')
def export(rid: str, format: str):
    run = get_run(rid)
    result = run.get('result')
    if not result:
        raise HTTPException(409, 'Analisis belum memiliki hasil akhir')
    calc = result['calculation']
    if format == 'csv':
        stream = io.StringIO(newline='')
        writer = csv.DictWriter(stream, fieldnames=['account_id', 'name', 'has_opportunity', 'intent', 'additional_outlets', 'target_outlets', 'gross_annual', 'net_annual_scenario', 'action', 'owner', 'evidence_ids', 'assumptions', 'gateway', 'provenance', 'review_reasons', 'next_steps'])
        writer.writeheader()
        writer.writerow({'account_id': run['account_id'], 'name': run['account_name'], 'has_opportunity': result['has_opportunity'],
                         'intent': result['intent_label'], **{k: calc[k] for k in ('additional_outlets', 'target_outlets', 'gross_annual', 'net_annual_scenario')},
                         'action': result['action_label'], 'owner': (result['owner'] or {}).get('nama'), 'evidence_ids': ';'.join(result['evidence_ids']),
                         'review_reasons': json.dumps(run['review_reasons'], ensure_ascii=False), 'next_steps': json.dumps(run['next_steps'], ensure_ascii=False), 'assumptions': '; '.join(calc['assumptions']), 'gateway': gateway(run), 'provenance': json.dumps({'supporting': result.get('provenance', []), 'evaluated': result.get('evaluated_provenance', [])}, ensure_ascii=False)})
        content, media, suffix = '\ufeff'+stream.getvalue(), 'text/csv; charset=utf-8', 'csv'
    elif format == 'md':
        content = f"# Account Expansion: {run['account_name']} ({run['account_id']})\n\n{result['title']}\n\n"
        content += f"- Evaluasi: {run['created_at']}\n- Model: {run['model']}\n- Rubrik: {run['rubric_version']}\n- Hash dataset: {run['dataset_hash']}\n- Snapshot: {run['snapshot']}\n- Berbeda versi data: {run['stale']}\n\n"
        content += f"## Hasil\n\n- Niat: {result['intent_label'] or 'Belum dinilai'}\n- Tambahan outlet: {calc['additional_outlets']}\n- Target: {calc['target_outlets']}\n- Bruto annualized: {calc['gross_annual']}\n- Neto skenario: {calc['net_annual_scenario']}\n- Formula: {calc['formula']}\n- Tindakan: {result['action_label']}\n- Owner: {(result['owner'] or {}).get('nama', 'Belum ditentukan')}\n\n"
        content += '## Yang perlu ditinjau\n\n' + ('\n'.join('- '+x['message'] for x in run['review_reasons']) or 'Tidak ada pemicu review pada hasil ini.') + '\n\n'
        content += '## Langkah berikutnya\n\n' + '\n'.join(f"- {x['action']} | Owner: {x['owner']} | Konfirmasi: {'; '.join(x['confirmations'])} | Hasil yang diharapkan: {x['expected_outcome']}" for x in run['next_steps']) + '\n\n'
        content += '## Asumsi dan perhatian\n\n' + '\n'.join('- '+x for x in calc['assumptions']+result['concerns'])
        content += '\n\n## Bukti\n\n' + '\n'.join(f"- {r['interaction_id']} | {r['tanggal']} | interactions.jsonl | {r['isi']}" for r in result['source_evidence'])
        content += '\n\n## Provenance tersimpan\n\nGateway: ' + gateway(run) + '\n\n'
        for label, items in [('Bukti pendukung hasil', result.get('provenance', [])), ('Data yang dievaluasi', result.get('evaluated_provenance', []))]:
            content += f'### {label}\n\n' + '\n'.join(f"- {x['id']} | {x['source']} | {x['role']} | {json.dumps(x['record'], ensure_ascii=False)}" for x in items) + '\n\n'
        content += '\n\nConfidence adalah kepastian penilaian model, bukan probabilitas deal menang.\n'
        media, suffix = 'text/markdown; charset=utf-8', 'md'
    else:
        raise HTTPException(404, 'Format tidak tersedia')
    return Response(content, media_type=media, headers={'Content-Disposition': f'attachment; filename="expansion-{run["account_id"]}.{suffix}"'})


if (ROOT / 'dist').exists():
    app.mount('/', StaticFiles(directory=ROOT / 'dist', html=True), name='dashboard')
