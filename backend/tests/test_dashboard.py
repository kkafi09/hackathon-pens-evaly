import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.analysis import Analyzer, JevClient, RunStore, calculate, number_candidates, validate_response
from backend.data import Dataset
from backend.app import app, dataset, store


@pytest.fixture(scope='session')
def data():
    return Dataset()


def choice(options, selected):
    return {'type': 'choice', 'choice': selected, 'probabilities': {key: float(key == selected) for key in options}, 'confidence': 1.0}


class ControlledJev:
    """Test-only answers. Never imported by production or inserted into runtime DB."""
    def __init__(self, ambiguous=False, bad_number=False):
        self.ambiguous, self.bad_number = ambiguous, bad_number

    async def evaluate(self, state, questions):
        answers = {}
        for key, q in questions.items():
            if q['type'] == 'score':
                level = 3 if any('penawaran' in r['isi'].lower() for r in state['expansion_messages']) else 2
                probabilities = {str(i): float(i == level) for i in range(4)}
                if self.ambiguous:
                    probabilities = {'0': 0, '1': 0, '2': .5, '3': .5}
                answers[key] = {'type': 'score', 'score': level if not self.ambiguous else 2.5, 'confidence': 1 if not self.ambiguous else 0,
                                'probabilities': probabilities, 'legend': {str(i): v for i, v in enumerate(q['criteria'])}}
            elif q['type'] == 'noul':
                answers[key] = {'type': 'noul', 'noul': .05}
            elif key == 'outlet_candidate':
                answers[key] = choice(q['criteria'], 'uncertain' if self.bad_number else next(iter(q['criteria'])))
            elif key == 'action':
                answers[key] = choice(q['criteria'], 'proposal')
            else:
                r = state['messages'][key]
                selected = 'expansion' if key in ('I0253', 'I0300') else 'other'
                answers[key] = choice(q['criteria'], selected)
        return {'id': 'controlled-response', 'provider': 'TypeSafe', 'model': 'controlled-test-model', 'answers': answers, 'usage': {'input_tokens': 1, 'output_tokens': 1, 'cost': .00001}}


def test_full_dataset_and_evidence(data):
    assert not data.warnings, 'Excel percentages should reconcile to equivalent CSV percentages'
    graph = data.graph()
    assert sum(n['kind'] == 'account' for n in graph['nodes']) == 45
    assert graph['pipeline_value'] == 667800000
    for aid in data.accounts:
        context = data.context(aid)
        assert context['account']['account_id'] == aid
        graph = data.graph(aid)
        ids = {n['id'] for n in graph['nodes']}
        assert all(e['source'] in ids and e['target'] in ids and not e['inference'] for e in graph['edges'])
    c02, c06 = data.context('C02'), data.context('C06')
    assert len(c02['tickets']) == 9
    assert {r['kategori'] for r in c02['tickets']} == {'permintaan_fitur'}
    assert len(c06['tickets']) == 25
    assert sum(r['status'] != 'Selesai' for r in c06['tickets']) == 1
    assert not c02['deals'] and not c06['decisions']
    email = next(r for r in c06['interactions'] if r['interaction_id'] == 'I0300')
    assert email['customer_sender'] and email['reply_count'] == 0
    assert c06['source_counts']['product_usage_daily'] == 30 * 365
    assert any(r['id'] == 'I0255' for r in data.graph('C02')['nodes'])


@pytest.mark.parametrize('aid,count,gross,net,target', [('C02', 6, 25200000, 23940000, 31), ('C06', 10, 42000000, 37800000, 40)])
def test_analysis_and_calculation(data, db_engine, aid, count, gross, net, target):
    db = RunStore(db_engine)
    run = db.create(aid, data.hash)
    asyncio.run(Analyzer(data, db, ControlledJev()).execute(run))
    saved = db.get(run['id'])
    assert saved['status'] == 'done'
    calc = saved['result']['calculation']
    assert (calc['additional_outlets'], calc['gross_annual'], calc['net_annual_scenario'], calc['target_outlets']) == (count, gross, net, target)
    assert calc['exceeds_package'] == (aid == 'C02')
    assert saved['model'] == 'controlled-test-model' and saved['calls']
    assert saved['gateway'] == 'openrouter'
    support = {item['id']: item for item in saved['result']['provenance']}
    assert f'K-{aid}' in support and support[f'K-{aid}']['role'] == 'calculation'
    email_id = 'I0253' if aid == 'C02' else 'I0300'
    assert support[email_id]['quote'] in support[email_id]['record']['isi']
    assert support[email_id]['assessments']
    assert support[email_id]['role'] == 'expansion'
    assert saved['calls'][0]['response_id'] == 'controlled-response'
    assert saved['calls'][0]['provider'] == 'TypeSafe' and saved['calls'][0]['cost'] == .00001
    evaluated = {item['id'] for item in saved['result']['evaluated_provenance']}
    assert {r['ticket_id'] for r in data.context(aid)['tickets']} <= evaluated
    assert {r['feature_id'] for r in data.context(aid)['features']} <= evaluated
    assert {r['contact_id'] for r in data.context(aid)['contacts']} <= evaluated
    assert evaluated > set(support)
    assert all('state' in c and 'questions' in c and 'source_ids' in c for c in saved['calls'])
    if aid == 'C06':
        assert 'I0300: Belum ada balasan tercatat' in saved['result']['concerns']


def test_no_opportunity_ambiguous_and_missing_values(data, db_engine):
    db = RunStore(db_engine)
    run = db.create('C04', data.hash)
    asyncio.run(Analyzer(data, db, ControlledJev()).execute(run))
    assert not run['result']['has_opportunity']
    assert run['steps'][2]['status'] == 'skipped'
    assert run['result']['calculation']['gross_annual'] is None
    run = db.create('C02', data.hash)
    asyncio.run(Analyzer(data, db, ControlledJev(ambiguous=True, bad_number=True)).execute(run))
    assert run['status'] == 'review'
    assert run['result']['calculation']['gross_annual'] is None
    context = data.context('C02'); context['contracts'] = []
    assert calculate(context, {'count': 6, 'interaction_id': 'I0253'})['gross_annual'] is None
    # A mention by an employee never becomes a parser-derived buyer count.
    assert number_candidates([{'isi': 'tambahkan 90 outlet', 'customer_sender': False}]) == []


def test_missing_key_persistence_and_restart(data, db_engine, monkeypatch):
    monkeypatch.delenv('OPENROUTER_API_KEY', raising=False)
    db = RunStore(db_engine)
    run = db.create('C06', data.hash)
    asyncio.run(Analyzer(data, db).execute(run))
    assert run['status'] == 'failed' and 'OPENROUTER_API_KEY' in run['error']
    assert run['steps'][0]['status'] == 'done' and run['steps'][1]['status'] == 'failed'
    assert not run['model'] and not run['result'] and not run['calls']
    pending = db.create('C02', data.hash)
    restarted = RunStore(db_engine)
    assert restarted.get(pending['id'])['status'] == 'failed'
    assert restarted.list('C06', 'different-hash')[0]['stale']


def test_response_validation():
    q = {'category': {'type': 'choice', 'criteria': {'a': '', 'b': ''}}}
    with pytest.raises(ValueError):
        validate_response({'model': 'test', 'answers': {'category': {'type': 'choice', 'choice': 'a', 'confidence': 1, 'probabilities': {'a': .1, 'b': .9}}}}, q)
    with pytest.raises(ValueError):
        validate_response({'model': 'test', 'answers': {}}, q)


def test_http_protocol(monkeypatch):
    monkeypatch.setenv('OPENROUTER_API_KEY', 'test-key-not-real')
    original = httpx.AsyncClient
    calls = []
    def handler(request):
        calls.append(request)
        assert request.headers['Authorization'] == 'Bearer test-key-not-real'
        body = json.loads(request.content)
        assert str(request.url) == 'https://openrouter.ai/api/v1/systemone'
        assert body['model'] == '~typesafe/jev-latest'
        assert body['state']['subject'] == 'test'
        return httpx.Response(200, json={'model': 'test-http-model', 'answers': {'check': {'type': 'noul', 'noul': .8}}})
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    response = asyncio.run(JevClient().evaluate({'subject': 'test'}, {'check': {'type': 'noul', 'instructions': 'Test'}}))
    assert response['model'] == 'test-http-model' and len(calls) == 1


@pytest.mark.parametrize('status,reason,attempts', [(401, 'key', 1), (402, 'Saldo', 1), (404, 'Model', 1), (429, 'Batas', 3), (503, 'Layanan', 3)])
def test_openrouter_failures(monkeypatch, status, reason, attempts):
    monkeypatch.setenv('OPENROUTER_API_KEY', 'controlled-key')
    original = httpx.AsyncClient
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(status, json={'error': {'message': 'remote message is not exposed'}})
    async def no_wait(_):
        pass
    monkeypatch.setattr(asyncio, 'sleep', no_wait)
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    with pytest.raises(ValueError, match=reason):
        asyncio.run(JevClient().evaluate({}, {}))
    assert len(requests) == attempts


@pytest.mark.parametrize('failure', ['timeout', 'json', 'schema'])
def test_openrouter_invalid_responses(monkeypatch, failure):
    monkeypatch.setenv('OPENROUTER_API_KEY', 'controlled-key')
    original = httpx.AsyncClient
    def handler(request):
        if failure == 'timeout':
            raise httpx.ReadTimeout('controlled timeout', request=request)
        return httpx.Response(200, text='invalid' if failure == 'json' else '{}')
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    with pytest.raises(ValueError):
        asyncio.run(JevClient().evaluate({}, {'check': {'type': 'noul'}}))


def test_pending_provenance_and_old_history(data, db_engine):
    db = RunStore(db_engine)
    run = db.create('C06', data.hash)
    class InspectPending(ControlledJev):
        async def evaluate(self, state, questions):
            pending = db.get(run['id'])
            stage = next(step for step in pending['steps'] if step['status'] == 'running')
            assert stage['provenance'] and stage['active_source_ids']
            return await super().evaluate(state, questions)
    asyncio.run(Analyzer(data, db, InspectPending()).execute(run))
    assert run['status'] == 'done'
    run.pop('gateway')
    db.save(run)
    assert db.list('C06', data.hash)[0]['gateway'] == 'typesafe'


def test_endpoints_and_exports(data, db_engine):
    db = RunStore(db_engine)
    app.dependency_overrides.clear()
    # Module-level accessors are patched to isolate all test history from production.
    import backend.app as module
    from unittest.mock import patch
    with patch.object(module, 'dataset', return_value=data), patch.object(module, 'store', return_value=db):
        with TestClient(app) as client:
            assert client.get('/api/health').json()['gateway'] == 'openrouter'
            assert 'configured_model' in client.get('/api/health').json()
            assert client.get('/api/graph').status_code == 200
            assert client.get('/api/accounts/C02/context').json()['source_counts']['tickets'] == 9
            assert client.get('/api/accounts/unknown/context').status_code == 404
            assert client.post('/api/accounts/P01/expansion-runs').status_code == 422
            assert client.get('/api/expansion-runs/missing').status_code == 404
            run = db.create('C06', data.hash)
            assert client.get(f"/api/expansion-runs/{run['id']}/export/md").status_code == 409
            asyncio.run(Analyzer(data, db, ControlledJev()).execute(run))
            md = client.get(f"/api/expansion-runs/{run['id']}/export/md")
            assert md.status_code == 200 and 'I0300' in md.text and '42000000' in md.text
            assert 'Bukti pendukung hasil' in md.text and 'K-C06' in md.text and 'openrouter' in md.text
            exported = client.get(f"/api/expansion-runs/{run['id']}/export/csv")
            assert '37800000' in exported.text
            assert client.get('/api/accounts/C06/expansion-runs').json()[0]['model'] == 'controlled-test-model'
