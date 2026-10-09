import copy
import io
import json
import csv

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from backend.expansion_score import build_score, display_score, score_label
from backend.rubric import BY_ID, pending
from backend.explanations import explain_run
from backend.tests.test_validation import UncertainOutlet
from backend.tests.test_rubric import run_analysis
from backend.data import Dataset


def perfect():
    entries = pending()
    selected = {'OI-2': 'outlets', 'EP-2': 'interactions', 'FE-2': 'outlets', 'BR-2': 'none', 'PC-2': 'none'}
    for key, entry in entries.items():
        entry.update(status='done', source_ids=['I1'])
        if entry['type'] == 'noul':
            entry['answer'] = {'type': 'noul', 'noul': 0 if key in ('BR-1', 'BR-4', 'PC-1') else 1}
        elif entry['type'] == 'score':
            entry['answer'] = {'type': 'score', 'score': 3, 'confidence': 1, 'probabilities': {str(k): float(k == 3) for k in range(4)}}
        else:
            entry['answer'] = {'type': 'choice', 'choice': selected[key], 'confidence': 1,
                               'probabilities': {k: float(k == selected[key]) for k in entry['criteria']}}
    entries['PC-3'].update(applicable=False, status='skipped')
    entries['EP-4']['checks'] = [{'id': key, 'passed': True} for key in ('source_ids', 'original_quotes', 'graph_paths')]
    evidence = [{'id': 'I1', 'source': 'interactions.jsonl'}, {'id': 'K1', 'source': 'contracts_billing.csv'}]
    return {'rubric_version': 'expansion-v2.0', 'status': 'done', 'rubric': entries, 'steps': [],
        'result': {'has_opportunity': True, 'provenance': evidence, 'evaluated_provenance': evidence,
                   'pipeline_candidates': [], 'calculation': {'gross_annual': 100}, 'action_label': 'Siapkan penawaran'}}


def aggregate(run):
    return build_score(run, run['rubric'], [], complete=True)


def test_perfect_neutral_pipeline_and_contribution_trace():
    run = perfect()
    before = copy.deepcopy(run)
    score, reasons = aggregate(run)
    assert not reasons and score['value'] == score['display_value'] == 100
    assert score['active_group_weight'] == 95 and score['applicable_count'] == 16
    assert len(score['parameters']) == 19
    assert sum(p['effective_weight'] for p in score['parameters']) == pytest.approx(1)
    assert sum(p['weighted_points'] or 0 for p in score['parameters']) == pytest.approx(score['base_score'])
    assert score['groups'][-1]['applicable'] is False
    assert run == before


def test_single_source_formula_and_conflicting_claim():
    run = perfect()
    run['result']['provenance'] = run['result']['provenance'][:1]
    run['rubric']['EP-3']['answer'].update(score=2, probabilities={'0': 0, '1': 0, '2': 1, '3': 0})
    run['rubric']['EP-5']['answer']['noul'] = 0
    score, reasons = aggregate(run)
    assert not reasons
    assert score['value'] == pytest.approx(100 * 87 / 95)
    assert score['display_value'] == 91.6
    run['rubric']['EP-3']['answer']['probabilities'] = {'0': 0, '1': 0, '2': 0, '3': 1}
    score, reasons = aggregate(run)
    assert reasons[0]['code'] == 'score_evidence_conflict'
    assert next(p for p in score['parameters'] if p['id'] == 'EP-3')['effective_value'] == pytest.approx(2/3)


@pytest.mark.parametrize('key', ['EP-2', 'FE-2', 'OI-2'])
def test_high_confidence_negative_choice_never_boosts_score(key):
    run = perfect()
    baseline, _ = aggregate(run)
    a = run['rubric'][key]['answer']
    selected = 'none' if key == 'OI-2' else 'insufficient'
    a.update(choice=selected, probabilities={k: float(k == selected) for k in a['probabilities']})
    score, _ = aggregate(run)
    p = next(p for p in score['parameters'] if p['id'] == key)
    assert p['confidence'] == 1 and p['effective_value'] == 0
    assert score['value'] < baseline['value']


def test_weighted_distribution_confidence_and_source_availability():
    run = perfect()
    run['rubric']['OI-3']['answer'].update(confidence=.8, probabilities={'0': .1, '1': .2, '2': .3, '3': .4})
    run['rubric']['EP-2']['source_ids'] = ['absent-record']
    score, _ = aggregate(run)
    values = {p['id']: p['effective_value'] for p in score['parameters']}
    assert values['OI-3'] == pytest.approx(.8 * (.2/3 + .3*2/3 + .4))
    assert values['EP-2'] == 0


@pytest.mark.parametrize('key', ['BR-1', 'BR-4'])
def test_risk_inversion_and_monotonicity(key):
    run = perfect()
    scores = []
    for probability in (0, .25, .5, .75, 1):
        run['rubric'][key]['answer']['noul'] = probability
        scores.append(aggregate(run)[0]['value'])
    assert scores == sorted(scores, reverse=True) and scores[0] > scores[-1]


def test_required_evidence_caps_and_financial_code_override():
    run = perfect()
    run['rubric']['EP-4']['answer']['noul'] = .35
    score, _ = aggregate(run)
    assert score['value'] == 35 and score['limiting_parameter_ids'] == ['EP-4']
    run = perfect()
    run['result']['calculation']['gross_annual'] = None
    score, _ = aggregate(run)
    assert score['value'] < 100
    for p in score['parameters']:
        if p['id'] in ('FE-1', 'FE-3'):
            assert p['raw_value'] == 1 and p['effective_value'] == 0


def test_pipeline_claim_without_path_is_not_neutral_or_positive():
    run = perfect()
    run['rubric']['PC-1']['answer']['noul'] = 1
    score, _ = aggregate(run)
    assert score['active_group_weight'] == 100
    assert next(p for p in score['parameters'] if p['id'] == 'PC-1')['effective_value'] == 0
    assert score['value'] < 100
    run = perfect()
    pc2 = run['rubric']['PC-2']['answer']
    pc2.update(choice='direct', probabilities={key: float(key == 'direct') for key in pc2['probabilities']})
    score, reasons = aggregate(run)
    assert score['active_group_weight'] == 100
    assert reasons[0]['code'] == 'unsupported_score_pipeline'


@pytest.mark.parametrize('condition', ['missing', 'invalid', 'failed', 'no_signal', 'incomplete', 'missing_checks'])
def test_unpublishable_score(condition):
    run = perfect()
    complete = True
    if condition == 'missing':
        run['rubric']['OI-3']['answer'] = None
    elif condition == 'invalid':
        run['rubric']['EP-4']['checks'] = [{'id': 'graph_paths', 'passed': False}]
    elif condition == 'failed':
        run['status'] = 'failed'
    elif condition == 'no_signal':
        run['result']['has_opportunity'] = False
    elif condition == 'missing_checks':
        run['rubric']['EP-4']['checks'] = []
    else:
        complete = False
    score, _ = build_score(run, run['rubric'], [], complete)
    assert score['value'] is score['display_value'] is None and score['unavailable_reason']


def test_no_rounding_to_false_100():
    assert display_score(99.99999) == 99.9
    assert display_score(100) == 100
    run = perfect()
    run['rubric']['BR-1']['answer']['noul'] = 1e-16
    assert aggregate(run)[0]['display_value'] == 99.9


def test_snapshot_replay_and_exports_share_score_without_writes(monkeypatch):
    import backend.app as module
    source = Dataset()
    store, run = run_analysis(source, 'C06', UncertainOutlet())
    assert run['result']['intent']['confidence'] == 1
    assert run['result']['expansion_score']['value'] < 100 and run['status'] == 'review'
    run['result'].pop('expansion_score')
    store.save(run)
    before = store.get(run['id'])
    monkeypatch.setattr(module, 'dataset', lambda: source)
    monkeypatch.setattr(module, 'store', lambda: store)
    client = TestClient(module.app)
    endpoint = f"/api/expansion-runs/{run['id']}"
    fetched = client.get(endpoint).json()
    score = fetched['result']['expansion_score']
    assert len(score['parameters']) == len(BY_ID) == 19
    markdown = client.get(endpoint + '/export/md').text
    previous_limit = csv.field_size_limit(10_000_000)
    try:
        row = next(csv.DictReader(io.StringIO(client.get(endpoint + '/export/csv').text.lstrip('\ufeff'))))
    finally:
        csv.field_size_limit(previous_limit)
    assert json.loads(row['expansion_score']) == score
    pdf = PdfReader(io.BytesIO(client.get(endpoint + '/export/pdf').content))
    text = '\n'.join(p.extract_text() for p in pdf.pages)
    assert score_label(score) in markdown and score_label(score) in text
    assert 'Bagaimana skor dihitung' in text and 'PC-3' in markdown
    assert store.get(run['id']) == before
    assert explain_run(fetched)['result']['expansion_score'] == score
