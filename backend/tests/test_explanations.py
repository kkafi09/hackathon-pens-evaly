import asyncio
import copy
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.analysis import Analyzer, RunStore
from backend.app import app
from backend.data import Dataset
from backend.explanations import explain_run
from backend.tests.test_dashboard import ControlledJev


@pytest.fixture(scope='module')
def data():
    return Dataset()


def reviewed_run(data, db_engine):
    class ReviewAction(ControlledJev):
        async def evaluate(self, state, questions):
            response = await super().evaluate(state, questions)
            if 'intent' in response['answers']:
                response['answers']['intent'].update(score=2.03, confidence=.97, probabilities={'0': 0, '1': 0, '2': .97, '3': .03})
            if 'action' in response['answers']:
                response['answers']['action'].update(choice='discovery', confidence=.56, probabilities={'discovery': .65, 'proposal': .35, 'resolve': 0, 'stakeholder': 0, 'insufficient': 0})
            return response
    db = RunStore(db_engine)
    run = db.create('C02', data.hash)
    asyncio.run(Analyzer(data, db, ReviewAction()).execute(run))
    return db, run


def test_c02_explanation_and_legacy(data, db_engine):
    db, run = reviewed_run(data, db_engine)
    assert run['status'] == 'review'
    reasons = run['review_reasons']
    assert len(reasons) == 1 and reasons[0]['stage'] == 'result'
    assert '56%' in reasons[0]['message'] and '60%' in reasons[0]['message']
    assert run['result']['intent']['confidence'] == .97
    assert run['result']['calculation']['gross_annual'] == 25200000
    step = run['next_steps'][0]
    assert step['owner'] and any('31' in x for x in step['confirmations'])
    assert any('6 outlet' in x for x in step['confirmations'])
    assert step['expected_outcome']
    assert db.get(run['id'])['review_reasons'] == reasons
    legacy = copy.deepcopy(run)
    for container in [legacy, legacy['result']]:
        container.pop('review_reasons'); container.pop('next_steps')
    assert explain_run(legacy)['review_reasons'] == reasons


def test_uncertainty_reasons_and_missing_history():
    run = {'steps': [{'id': 'classification', 'status': 'review', 'data': {'classifications': [{'interaction_id': 'I1', 'choice': 'unclear', 'confidence': .4, 'probabilities': {'unclear': .5, 'other': .5}}]}}], 'result': None}
    reasons = explain_run(run)['review_reasons']
    assert {r['code'] for r in reasons} == {'low_confidence', 'tied_choices', 'unclear_classification'}
    assert all(r['source_ids'] == ['I1'] for r in reasons)
    minimal = {'steps': [{'id': 'intent', 'status': 'review', 'data': None}], 'result': None}
    assert explain_run(minimal)['review_reasons'][0]['code'] == 'limited_history'


def test_uncertain_number_and_intent(data, db_engine):
    db = RunStore(db_engine)
    run = db.create('C02', data.hash)
    asyncio.run(Analyzer(data, db, ControlledJev(ambiguous=True, bad_number=True)).execute(run))
    assert any(r['code'] == 'unconfirmed_outlets' for r in run['review_reasons'])
    assert any(r['stage'] == 'intent' and r['code'] == 'tied_choices' for r in run['review_reasons'])
    run = db.create('C04', data.hash)
    asyncio.run(Analyzer(data, db, ControlledJev()).execute(run))
    assert run['status'] == 'done' and run['review_reasons'] == []
    assert run['next_steps'][0]['action'] and not run['result']['has_opportunity']


@pytest.mark.parametrize('status', ['waiting', 'running', 'done', 'review', 'failed'])
def test_delete_status_and_exports(data, db_engine, status):
    import backend.app as module
    db, run = reviewed_run(data, db_engine)
    run['status'] = status
    db.save(run)
    with patch.object(module, 'dataset', return_value=data), patch.object(module, 'store', return_value=db):
        client = TestClient(app)
        rid = run['id']
        md = client.get(f'/api/expansion-runs/{rid}/export/md').text
        csv = client.get(f'/api/expansion-runs/{rid}/export/csv').text
        assert '56%' in md and 'Langkah berikutnya' in md
        assert 'review_reasons' in csv and 'next_steps' in csv
        response = client.delete(f'/api/expansion-runs/{rid}')
        if status in ('waiting', 'running'):
            assert response.status_code == 409 and db.get(rid)
        else:
            assert response.status_code == 204 and response.content == b''
            assert db.get(rid) is None
            assert client.get(f'/api/expansion-runs/{rid}').status_code == 404
            assert client.delete(f'/api/expansion-runs/{rid}').status_code == 404


def test_legacy_read_does_not_write(data, db_engine):
    import backend.app as module
    db, run = reviewed_run(data, db_engine)
    run.pop('review_reasons'); run.pop('next_steps')
    run['result'].pop('review_reasons'); run['result'].pop('next_steps')
    db.save(run)
    with patch.object(module, 'dataset', return_value=data), patch.object(module, 'store', return_value=db):
        response = TestClient(app).get(f"/api/expansion-runs/{run['id']}")
        assert response.json()['review_reasons'][0]['confidence'] == .56
    assert 'review_reasons' not in db.get(run['id'])
