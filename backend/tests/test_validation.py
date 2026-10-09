import copy
import csv
import io

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from backend.data import Dataset
from backend.explanations import explain_run
from backend.pdf_reports import render
from backend.tests.test_dashboard import ControlledJev
from backend.tests.test_rubric import run_analysis


class UncertainOutlet(ControlledJev):
    async def evaluate(self, state, questions):
        response = await super().evaluate(state, questions)
        if 'outlet_candidate' in questions:
            value = response['answers']['outlet_candidate']
            value.update(confidence=.54, probabilities={key: .54 if key == value['choice'] else .46 if key == 'uncertain' else 0 for key in value['probabilities']})
        if 'EP-5' in questions:
            response['answers']['EP-5']['noul'] = .05
        return response


@pytest.fixture(scope='module')
def source():
    return Dataset()


def test_screenshot_case_and_replay(source):
    _, run = run_analysis(source, 'C06', UncertainOutlet())
    result = run['result']
    summary = result['validation_summary']
    assert result['intent']['confidence'] == 1
    assert result['calculation']['gross_annual'] is None
    assert summary['status'] == run['status'] == 'review'
    assert summary['title'] == 'Hasil perlu ditinjau'
    assert summary['summary'] == 'Sinyal ekspansi ditemukan; sebagian hasil belum terverifikasi.'
    assert summary['supporting_record_count'] == summary['source_count'] == 1
    assert summary['evaluated_record_count'] > summary['supporting_record_count']
    assert summary['estimate_label'] == 'Belum dihitung'
    assert 'outlet_candidate' in summary['review_parameter_ids']
    assert run['next_steps'][0]['label'] == 'Usulan setelah verifikasi'
    assert any(v['source_ids'] for v in run['next_steps'][0]['verification'])
    before = copy.deepcopy(run)
    explain_run(run)
    assert run == before
    # Reconstruct explanations from original saved answers, without gateway calls.
    run.pop('review_reasons')
    result.pop('validation_summary')
    explain_run(run)
    assert any(r['code'] == 'low_confidence' and r.get('question_id') == 'outlet_candidate' for r in run['review_reasons'])


def single_source(source):
    _, run = run_analysis(source)
    run['result']['provenance'] = [e for e in run['result']['provenance'] if e['source'] == 'interactions.jsonl']
    run['rubric']['EP-5']['answer']['noul'] = .05
    run['rubric']['EP-3']['answer'].update(score=2, probabilities={'0': 0, '1': 0, '2': 1, '3': 0})
    return run


def test_single_source_records_and_ep5_conflict(source):
    run = single_source(source)
    explain_run(run)
    summary = run['result']['validation_summary']
    assert run['status'] == 'done'
    assert summary['source_count'] == 1 and summary['supporting_record_count'] == 2
    assert 'Bukti pendukung berasal dari satu sumber' in summary['limitations'][0]
    assert run['rubric']['EP-5']['status'] == 'done'
    run['rubric']['EP-5']['answer']['noul'] = .95
    explain_run(run)
    assert run['status'] == 'review'
    assert run['rubric']['EP-5']['status'] == 'review'
    assert any(r['code'] == 'source_count_conflict' for r in run['review_reasons'])


def test_multisource_negative_ep5_and_valid_negative_answers(source):
    _, run = run_analysis(source)
    run['rubric']['EP-5']['answer']['noul'] = .05
    explain_run(run)
    summary = run['result']['validation_summary']
    assert summary['status'] == 'done' and summary['source_count'] == 2
    assert 'relevansi bukti lintas sumber' in summary['limitations'][0]
    assert run['rubric']['BR-1']['answer']['noul'] == .05
    assert run['rubric']['PC-1']['answer']['noul'] == .05
    assert run['rubric']['BR-4']['answer']['noul'] == .95


@pytest.mark.parametrize('key', ['FE-1', 'FE-3', 'EP-1', 'EP-4'])
def test_negative_required_validation(source, key):
    _, run = run_analysis(source)
    run['rubric'][key]['answer']['noul'] = .05
    explain_run(run)
    assert run['status'] == run['rubric'][key]['status'] == 'review'
    assert key in run['result']['validation_summary']['review_parameter_ids']
    if key.startswith('FE'):
        assert run['result']['calculation']['gross_annual'] == 25200000
        assert run['result']['validation_summary']['estimate_label'] == 'Skenario belum terverifikasi'


def test_incomplete_no_signal_and_failed(source):
    _, run = run_analysis(source)
    run['rubric']['OI-3']['answer'] = None
    run['result'].pop('provenance')
    explain_run(run)
    assert run['status'] == 'review'
    assert not run['result']['validation_summary']['complete']
    assert 'Validasi tersimpan belum lengkap' in run['result']['validation_summary']['limitations']
    assert run['rubric']['OI-3']['status'] == 'review'
    _, empty = run_analysis(source, 'C04')
    assert empty['status'] == 'done'
    assert empty['result']['validation_summary']['title'] == 'Belum ditemukan sinyal ekspansi dari data tersedia'
    failed = {'rubric_version': 'expansion-v2.0', 'status': 'failed', 'result': None}
    explain_run(failed)
    assert failed['result'] is None


def test_read_exports_and_pdf_agree_without_history_writes(source, monkeypatch):
    import backend.app as module
    store, run = run_analysis(source, 'C06', UncertainOutlet())
    # Simulate pre-change v2 history, persisted as done with no derived summary.
    run['status'] = 'done'
    run['result'].pop('validation_summary')
    store.save(run)
    before = store.get(run['id'])
    monkeypatch.setattr(module, 'store', lambda: store)
    monkeypatch.setattr(module, 'dataset', lambda: source)
    client = TestClient(module.app)
    base = f"/api/expansion-runs/{run['id']}"
    fetched = client.get(base).json()
    summary = fetched['result']['validation_summary']
    markdown = client.get(base + '/export/md').text
    previous_limit = csv.field_size_limit(10_000_000)
    try:
        row = next(csv.DictReader(io.StringIO(client.get(base + '/export/csv').text.lstrip('\ufeff'))))
    finally:
        csv.field_size_limit(previous_limit)
    pdf = '\n'.join(page.extract_text() for page in PdfReader(io.BytesIO(render([fetched]))).pages)
    assert summary['title'] in markdown and summary['title'] in pdf and row['title'] == summary['title']
    assert row['validation_status'] == 'review' and not row['intent']
    assert 'Niat:' not in markdown and 'Tingkat niat:' not in pdf
    assert 'Usulan setelah verifikasi' in markdown and 'Usulan setelah verifikasi' in pdf
    assert store.get(run['id']) == before


def test_report_filters_use_replayed_status(source, db_engine):
    from backend.analysis import RunStore
    store = RunStore(db_engine)
    _, run = run_analysis(source, 'C06', UncertainOutlet())
    run['status'] = 'done'
    run['result'].pop('validation_summary')
    store.save(run)
    assert store.reports(status='done')['total'] == 0
    report = store.reports(status='review')
    assert report['total'] == 1 and report['items'][0]['title'] == 'Hasil perlu ditinjau'
    assert store.list('C06', source.hash)[0]['status'] == 'review'
    assert store.get(run['id'])['status'] == 'done'
