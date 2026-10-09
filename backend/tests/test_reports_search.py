import copy
from io import BytesIO
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader
from backend.data import Dataset
from backend.search import search, _cache
from backend.pdf_reports import render
from backend.rubric import QUESTIONS
from backend.tests.test_rubric import run_analysis
from backend.analysis import RunStore


@pytest.fixture(scope='module')
def source():
    return Dataset()


def test_search_all_kinds_snippets_and_real_context(source):
    assert search(source, 'I0253')['items'][0]['id'] == 'I0253'
    assert search(source, 'K-C06')['items'][0]['kind'] == 'contract'
    assert search(source, 'C02')['items'][0]['id'] == 'C02'
    message = source.context('C02')['interactions']
    email = next(r for r in message if r['interaction_id'] == 'I0253')
    hit = next(r for r in search(source, 'Sidoarjo', 100)['items'] if r['id'] == 'I0253')
    assert hit['matched_field'] == 'isi' and 'Sidoarjo' in hit['snippet']
    assert 'C02' in hit['account_ids']
    assert hit['record'] == email
    contact = source.context('C02')['contacts'][0]
    assert any(r['id'] == contact['contact_id'] for r in search(source, contact['email'],100)['items'])
    shared = next(r for r in search(source, 'FEAT',100)['items'] if len(r['accounts'])>1)
    assert shared['kind'] == 'feature'
    for account in shared['accounts']:
        assert shared['id'] in {n['id'] for n in source.graph(account['id'])['nodes']}
    result = search(source, 'a', 2, 2)
    assert len(result['items']) == 2 and result['total'] > 2
    assert search(source, 'nothing-is-here')['total'] == 0
    assert source.hash in _cache


def test_rubric_table_matches_definition():
    text = (Path(__file__).resolve().parents[2] / 'RUBRIK_EVALUASI.md').read_text(encoding='utf-8')
    rows = [line.split('|')[1:4] for line in text.splitlines() if line.startswith('| ')][2:]
    assert [[cell.strip() for cell in row] for row in rows] == [[q['id'], q['text'], q['type'].title()] for q in QUESTIONS]


def test_pdf_snapshot_failed_legacy_long_text_and_combined(source):
    _, run = run_analysis(source)
    run['result']['concerns'].append('Konfirmasi panjang: ' + ('Outlet dan harga perlu dikonfirmasi. ' * 100))
    run['result']['provenance'][0]['record']['nama'] = 'Pelanggan Ω - Jawa'
    failed = copy.deepcopy(run)
    failed.update(id='failed', status='failed', result=None, rubric={}, error='API tidak tersedia', next_steps=[], review_reasons=[])
    legacy = copy.deepcopy(run)
    legacy.update(id='legacy', rubric_version='v1')
    legacy.pop('rubric')
    before = copy.deepcopy(run)
    content = render([run, failed, legacy])
    reader = PdfReader(BytesIO(content))
    text = '\n'.join(p.extract_text() for p in reader.pages)
    assert len(reader.pages)>3
    for value in ('Ringkasan laporan', 'OI-1', 'EP-5', 'I0253', 'Rp25.200.000', 'API tidak tersedia', 'Pelanggan Ω', 'Tidak ditambahkan jawaban baru'):
        assert value in text
    assert 'tidak dijumlahkan' in text
    assert run == before


def test_reports_database_filters_and_pages(db_engine, source):
    store = RunStore(db_engine)
    for i in range(28):
        row=store.create('C02' if i<27 else 'C06',source.hash)
        row.update(account_name='TB Sinar Jaya' if i<27 else 'Saiyo Group',status='done' if i%2 else 'failed')
        store.save(row)
    assert len(store.reports()['items'])==25
    assert store.reports()['total']==28
    assert len(store.reports(offset=25)['items'])==3
    assert store.reports('Saiyo')['total']==1
    assert store.reports(status='done')['total']==14
    assert store.reports('%')['total']==0


def test_reports_sort_only_ids_and_restore_payload_order():
    from types import SimpleNamespace
    from sqlalchemy.dialects import mysql

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, statement):
            sql = str(statement.compile(dialect=mysql.dialect()))
            statements.append(sql)
            if 'count(' in sql:
                return SimpleNamespace(scalar=lambda: 2)
            if 'ORDER BY' in sql:
                assert 'expansion_runs.payload' not in sql.split('FROM')[0]
                assert 'expansion_runs.created_at DESC, expansion_runs.id DESC' in sql
                return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: ['b', 'a']))
            assert 'ORDER BY' not in sql and 'expansion_runs.id IN' in sql
            return SimpleNamespace(all=lambda: [SimpleNamespace(id=rid, payload={
                'id': rid, 'account_id': 'C02', 'status': 'done', 'result': None,
                'snapshot_data': 'large evidence ' * 100000,
            }) for rid in ('a', 'b')])

    statements = []
    db = SimpleNamespace(connect=lambda: Connection())
    result = RunStore(db, recover=False).reports(limit=25, offset=0)
    assert result['total'] == 2
    assert [row['id'] for row in result['items']] == ['b', 'a']
    assert len(statements) == 3


def test_report_api_validation_and_downloads(monkeypatch, source):
    import backend.app as app
    _, run = run_analysis(source)
    active = copy.deepcopy(run); active.update(id='active',status='running')
    class Store:
        def get(self, rid):
            return copy.deepcopy({run['id']:run,'active':active}.get(rid))
        def reports(self, q, status, limit, offset):
            return {'items':[], 'total':0,'limit':limit,'offset':offset}
    monkeypatch.setattr(app,'dataset',lambda:source)
    monkeypatch.setattr(app,'store',lambda:Store())
    client=TestClient(app.app)
    assert client.get('/api/graph/search?q=I0253').json()['items'][0]['id']=='I0253'
    assert client.get('/api/graph/search?limit=0').status_code==422
    assert client.get('/api/expansion-runs?status=bad').status_code==422
    assert client.get('/api/expansion-runs').status_code==200
    response=client.get(f"/api/expansion-runs/{run['id']}/export/pdf")
    assert response.status_code==200 and response.content.startswith(b'%PDF')
    assert client.post('/api/expansion-runs/export/pdf',json={'run_ids':['active']}).status_code==409
    assert client.post('/api/expansion-runs/export/pdf',json={'run_ids':[run['id'],'missing']}).status_code==404
    assert client.post('/api/expansion-runs/export/pdf',json={'run_ids':[]}).status_code==422
    assert client.post('/api/expansion-runs/export/pdf',json={'run_ids':['a']*51}).status_code==422
    assert client.post('/api/expansion-runs/export/pdf',json={'run_ids':[run['id']]}).status_code==200
