import copy
import csv
import io
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader
from backend.data import Dataset
from backend.explanations import explain_run
from backend.localization import CATALOG, project, text
from backend.pdf_reports import render
from backend.rubric import definition
from backend.tests.test_rubric import run_analysis
from backend.tests.test_validation import UncertainOutlet, single_source


@pytest.fixture(scope='module')
def fixtures():
    data = Dataset()
    store, run = run_analysis(data)
    _, review = run_analysis(data, 'C06', UncertainOutlet())
    return data, store, run, review


def test_catalog_keys_placeholders_and_rubric():
    import re
    root = Path(__file__).resolve().parents[2]
    identity = json.loads((root / 'locales/id.json').read_text(encoding='utf-8'))
    assert set(identity) == set(CATALOG)
    for key, translation in CATALOG.items():
        assert re.findall(r'\{\d+\}', key) == re.findall(r'\{\d+\}', translation), key
        assert identity[key] == key
    original = definition()
    translated = project(original, 'en', 'rubric')
    assert len(translated['questions']) == 19
    for a, b in zip(original['questions'], translated['questions']):
        assert a['id'] == b['id'] and a['type'] == b['type']
        assert a['text'] != b['text'] and not b['text'].startswith('Original text:')
        if isinstance(a['criteria'], dict):
            assert a['criteria'].keys() == b['criteria'].keys()
        else:
            assert len(a['criteria']) == len(b['criteria'])


@pytest.mark.parametrize('index', [2, 3])
def test_presentation_preserves_audit_sources_and_scores(fixtures, index):
    run = explain_run(copy.deepcopy(fixtures[index]))
    run['result']['provenance'][0]['record']['isi'] = 'Perlu ditinjau'
    run['result']['provenance'][0]['quote'] = 'Perlu ditinjau'
    before = copy.deepcopy(run)
    english = project(run, 'en')
    assert run == before and project(run, 'id') == run
    assert english['calls'] == run['calls']
    assert english['result']['provenance'] == run['result']['provenance']
    assert english['result']['evaluated_provenance'] == run['result']['evaluated_provenance']
    assert english['result']['source_evidence'] == run['result']['source_evidence']
    assert english['status'] == run['status']
    for key, entry in run['rubric'].items():
        assert english['rubric'][key]['answer'] == entry['answer']
        assert english['rubric'][key]['source_ids'] == entry['source_ids']
    for key in ('value', 'display_value', 'base_score', 'cap_score', 'active_group_weight', 'version'):
        assert english['result']['expansion_score'][key] == run['result']['expansion_score'][key]
    assert 'Original text:' not in english['result']['validation_summary']['title']
    assert all('Original text:' not in item['message'] for item in english['review_reasons'])
    assert english == project(english, 'en')


def test_unknown_legacy_text_and_no_signal_or_failed(fixtures):
    run = copy.deepcopy(fixtures[2])
    run['review_reasons'] = [{'code': 'old_custom', 'title': 'Catatan lama bebas', 'message': 'Pesan arsip yang tidak dikenal'}]
    english = project(run, 'en')
    assert english['review_reasons'][0]['message'] == 'Original text: Pesan arsip yang tidak dikenal'
    failed = {**run, 'status': 'failed', 'result': None, 'error': 'Proses sebelumnya terhenti. Jalankan analisis baru.'}
    assert project(failed, 'en')['error'].startswith('The previous process')
    assert text('Belum ditemukan sinyal ekspansi dari data tersedia', 'en').startswith('No expansion signal')


def test_all_api_and_export_surfaces(fixtures, monkeypatch):
    import backend.app as app
    data, store, run, review = fixtures
    store.save(review)
    monkeypatch.setattr(app, 'dataset', lambda: data)
    monkeypatch.setattr(app, 'store', lambda: store)
    monkeypatch.setattr(store, 'list', lambda aid, digest: [copy.deepcopy(review)])
    monkeypatch.setattr(store, 'reports', lambda *args: {'items': [{'id': rid, 'status': review['status'], 'title': review['result']['title'], 'validation_summary': explain_run(copy.deepcopy(review))['result']['validation_summary'], 'expansion_score': explain_run(copy.deepcopy(review))['result']['expansion_score']}], 'total': 1})
    client = TestClient(app.app)
    rid = review['id']
    for path in ('/api/expansion-rubric', '/api/graph', '/api/accounts/C06/context', '/api/accounts/C06/expansion-runs', f'/api/expansion-runs/{rid}'):
        assert client.get(path + '?lang=fr').status_code == 422
        assert client.get(path + '?lang=en').status_code == 200
    original = client.get(f'/api/expansion-runs/{rid}').json()
    english = client.get(f'/api/expansion-runs/{rid}?lang=en').json()
    assert english['result']['validation_summary']['title'] == 'Result needs review'
    assert english['result']['expansion_score']['value'] == original['result']['expansion_score']['value']
    assert english['calls'] == original['calls']
    report = client.get('/api/expansion-runs?lang=en').json()['items'][0]
    assert report['validation_summary']['title'] == english['result']['validation_summary']['title']
    assert report['expansion_score']['value'] == english['result']['expansion_score']['value']
    assert client.get('/api/expansion-runs/missing?lang=en').json()['detail'] == 'Result not found'
    assert client.get('/api/expansion-runs/missing?lang=fr').status_code == 422
    response = client.get(f'/api/expansion-runs/{rid}/export/md?lang=en')
    assert response.status_code == 200 and '## Expansion support score' in response.text
    assert 'Result needs review' in response.text and '## Items to review' in response.text
    assert review['result']['source_evidence'][0]['isi'] in response.text
    response = client.get(f'/api/expansion-runs/{rid}/export/csv?lang=en')
    previous_limit = csv.field_size_limit(10_000_000)
    try:
        row = next(csv.DictReader(io.StringIO(response.text.lstrip('\ufeff'))))
    finally:
        csv.field_size_limit(previous_limit)
    assert row['title'] == 'Result needs review'
    assert json.loads(row['provenance'])['supporting'] == original['result']['provenance']
    assert row['validation_status'] == original['status']
    exported_score = json.loads(row['expansion_score'])
    for a, b in zip(exported_score['parameters'], original['result']['expansion_score']['parameters']):
        for field in ('raw_value', 'effective_value', 'effective_weight', 'weighted_points'):
            assert a[field] == b[field]
    for response in [client.get(f'/api/expansion-runs/{rid}/export/pdf?lang=en'), client.post('/api/expansion-runs/export/pdf?lang=en', json={'run_ids': [rid, run['id']]})]:
        assert response.status_code == 200
        contents = '\n'.join(page.extract_text() for page in PdfReader(io.BytesIO(response.content)).pages)
        assert 'Result needs review' in contents and 'Expansion support score' in contents
        assert 'How the score is calculated' in contents
        assert 'Skor dukungan ekspansi' not in contents
    assert client.get(f'/api/expansion-runs/{rid}/export/md?lang=fr').status_code == 422
    assert client.post('/api/expansion-runs/export/pdf?lang=fr', json={'run_ids': [rid]}).status_code == 422


def test_pdf_preserves_original_words_and_supports_single_source(fixtures):
    run = explain_run(single_source(fixtures[0]))
    run['result']['provenance'][0]['record']['label_test'] = 'Perlu ditinjau'
    run['result']['provenance'][0]['quote'] = 'Perlu ditinjau'
    before = copy.deepcopy(run)
    contents = '\n'.join(page.extract_text() for page in PdfReader(io.BytesIO(render([run], lang='en'))).pages)
    assert 'label_test: Perlu ditinjau' in contents
    assert 'Quote: Perlu ditinjau' in contents
    assert 'Supporting evidence comes from one source' in contents
    assert run == before


def test_localized_formats_and_incomplete_or_no_signal(fixtures):
    from backend.localization import score_label
    from backend.pdf_reports import rupiah, time_label
    assert score_label({'display_value': 91.6}, 'id').endswith('91,6%')
    assert score_label({'display_value': 91.6}, 'en').endswith('91.6%')
    assert rupiah(25200000, 'id') == 'Rp25.200.000'
    assert rupiah(25200000, 'en') == 'IDR 25,200,000'
    assert time_label('2026-10-01T00:00:00Z', 'en') == 'Oct 01, 2026 07:00 UTC+07:00'
    assert time_label('2026-10-01T00:00:00Z', 'id') == '01-10-2026 07:00 WIB'
    incomplete = copy.deepcopy(fixtures[2])
    incomplete['rubric']['OI-3']['answer'] = None
    incomplete['result'].pop('provenance')
    derived = explain_run(incomplete)
    before = copy.deepcopy(derived)
    english = project(derived, 'en')
    assert english['status'] == derived['status'] == 'review'
    assert not english['result']['validation_summary']['complete']
    assert 'Saved validation is incomplete' in english['result']['validation_summary']['limitations']
    assert derived == before
    _, empty = run_analysis(fixtures[0], 'C04')
    english = project(empty, 'en')
    assert english['status'] == 'done'
    assert english['result']['validation_summary']['title'] == 'No expansion signal found in the available data'
    assert english['result']['has_opportunity'] == empty['result']['has_opportunity']


@pytest.mark.parametrize('lang,header', [('id', 'Kontribusi mentah'), ('en', 'Raw contribution')])
def test_parameter_tables_only_show_raw_contribution(fixtures, monkeypatch, lang, header):
    from backend.expansion_score import markdown_score
    from backend.localized_exports import markdown
    import backend.pdf_reports as pdf
    run = explain_run(copy.deepcopy(fixtures[2]))
    run['stale'] = False  # Set by get_run before export in the application.
    before = copy.deepcopy(run)
    displayed = project(run, lang)
    document = markdown_score(run['result']['expansion_score']) if lang == 'id' else markdown(displayed)
    lines = document.splitlines()
    table_header = next(line for line in lines if line.startswith('| Parameter |'))
    assert table_header.split('|')[2].strip() == header
    assert len(table_header.split('|')) == 6  # four columns plus delimiters
    assert 'Efektif' not in table_header and 'Effective' not in table_header
    assert 'Poin' not in table_header and 'Points' not in table_header
    rows = [line for line in lines if line.startswith(('| OI-', '| EP-', '| FE-', '| BR-', '| PC-'))]
    assert len(rows) == 19 and all(len(line.split('|')) == 6 for line in rows)
    assert run['result']['expansion_score']['parameters'][0]['source_ids'][0] in document
    captured = []
    original_table = pdf.LongTable
    def capture(data, *args, **kwargs):
        labels = [cell.getPlainText() for cell in data[0]]
        if labels[0] == 'Parameter':
            captured.append(data)
        return original_table(data, *args, **kwargs)
    monkeypatch.setattr(pdf, 'LongTable', capture)
    pdf.render([run, copy.deepcopy(fixtures[3])], lang=lang)
    assert len(captured) == 2
    for table in captured:
        assert [cell.getPlainText() for cell in table[0]][:2] == ['Parameter', header]
        assert len(table) == 20 and all(len(row) == 3 for row in table)
    assert run == before
