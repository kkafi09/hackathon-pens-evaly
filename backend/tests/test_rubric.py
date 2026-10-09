"""Rubric semantics can be verified without a live gateway or production database."""
import asyncio
import copy
from types import SimpleNamespace

import pytest
from backend.analysis import Analyzer, RunStore
from backend.data import Dataset
from backend.pipeline import candidates
from backend.rubric import BY_ID, QUESTIONS, definition, review_reasons
from backend.tests.test_dashboard import ControlledJev


class MemoryStore(RunStore):
    """Test fixture only; the production RunStore remains MySQL-only."""
    def __init__(self):
        self.rows = {}

    def save(self, run):
        self.rows[run['id']] = copy.deepcopy(run)

    def get(self, rid):
        return copy.deepcopy(self.rows.get(rid))


@pytest.fixture(scope='module')
def data():
    return Dataset()


def run_analysis(data, aid='C02', client=None):
    store = MemoryStore()
    run = store.create(aid, data.hash)
    asyncio.run(Analyzer(data, store, client or ControlledJev()).execute(run))
    return store, run


def test_exact_rubric_and_dependencies():
    assert len(QUESTIONS) == len(BY_ID) == 19
    assert {q['id'] for q in QUESTIONS} == {f'{prefix}-{n}' for prefix, count in [('OI', 4), ('EP', 5), ('FE', 3), ('BR', 4), ('PC', 3)] for n in range(1, count+1)}
    assert [s['id'] for s in definition()['steps']] == ['context', 'opportunity', 'financial', 'readiness', 'pipeline', 'evidence', 'result']
    assert BY_ID['OI-1']['text'] == 'Apakah data menunjukkan sinyal ekspansi dari pelanggan yang sudah ada?'
    assert {q['type'] for q in QUESTIONS} == {'noul', 'choice', 'score'}
    assert all(len(q['criteria']) == 4 for q in QUESTIONS if q['type'] == 'score')


@pytest.mark.parametrize('aid,target,gross,net', [('C02',31,25200000,23940000), ('C06',40,42000000,37800000)])
def test_v2_complete_sources_and_values(data, aid, target, gross, net):
    store, run = run_analysis(data, aid)
    assert run['status'] == 'done', run.get('error') or run.get('review_reasons')
    assert len(run['rubric']) == 19
    assert run['result']['calculation']['target_outlets'] == target
    assert run['result']['calculation']['gross_annual'] == gross
    assert run['result']['calculation']['net_annual_scenario'] == net
    assert run['rubric_version'] == 'expansion-v2.0'
    assert run['rubric']['PC-3']['status'] == 'skipped'
    assert not run['result']['pipeline_supported']
    assert not run['result']['pipeline_candidates']
    assert all(c['passed'] for c in run['rubric']['EP-4']['checks'])
    assert store.get(run['id'])['rubric'] == run['rubric']
    calls = run['calls']
    assert next(i for i,c in enumerate(calls) if 'action' in c['questions']) < next(i for i,c in enumerate(calls) if 'EP-1' in c['questions'])
    evaluated = {e['id'] for e in run['result']['evaluated_provenance']}
    assert all(set(q['source_ids']) <= evaluated for q in run['rubric'].values())
    assert all(set(c['source_ids']) <= evaluated for c in calls)
    assert f'K-{aid}' in run['rubric']['FE-1']['source_ids']
    assert 'I0255' in run['result']['evidence_ids'] if aid == 'C02' else 'Belum ada balasan tercatat' in str(run['result']['concerns'])


def test_no_opportunity_and_numeric_ambiguity(data):
    _, run = run_analysis(data, 'C04')
    assert run['status'] == 'done' and not run['result']['has_opportunity']
    assert run['result']['calculation']['gross_annual'] is None
    assert run['rubric']['FE-1']['applicable'] is False
    assert run['rubric']['EP-1']['status'] == 'skipped'
    _, run = run_analysis(data, client=ControlledJev(ambiguous=True, bad_number=True))
    assert run['status'] == 'review'
    assert {'unconfirmed_outlets', 'tied_choices'} <= {r['code'] for r in run['review_reasons']}
    assert run['result']['calculation']['gross_annual'] is None


@pytest.mark.parametrize('value,review', [(.4,False),(.6,False),(.5,True),(.95,False),(.05,False)])
def test_noul_support_is_not_confidence(value, review):
    reasons = review_reasons(BY_ID['BR-1'], {'type':'noul','noul':value}, ['T1'])
    assert bool(reasons) == review
    assert all('confidence' not in r for r in reasons)


def test_unsupported_pipeline_and_failed_stage(data):
    class Unsupported(ControlledJev):
        async def evaluate(self, state, questions):
            result = await super().evaluate(state, questions)
            if 'PC-1' in questions:
                result['answers']['PC-1']['noul'] = .95
            return result
    _, run = run_analysis(data, client=Unsupported())
    assert run['status'] == 'review' and not run['result']['pipeline_supported']
    assert any(r['code'] == 'unsupported_pipeline' for r in run['review_reasons'])

    class Failing(ControlledJev):
        async def evaluate(self, state, questions):
            if 'FE-1' in questions:
                raise ValueError('controlled broken response')
            return await super().evaluate(state, questions)
    store, run = run_analysis(data, client=Failing())
    assert run['status'] == 'failed' and run['result'] is None
    assert run['rubric']['FE-1']['status'] == 'failed'
    assert run['rubric']['FE-1']['source_ids']
    assert run['rubric']['EP-1']['status'] == 'skipped'
    assert store.get(run['id'])['rubric']['OI-1']['answer']


def test_pipeline_requires_records_not_shared_owner():
    deal = {'deal_id':'D1','account_id':'P01','status':'Terbuka'}
    dataset = SimpleNamespace(accounts={'C02':{},'P01':{}}, tables={'crm_deals':[deal], 'contact_employment_history':[]})
    context = {'snapshot':'2026-10-01','interactions':[]}
    assert candidates(dataset, 'C02', context) == []
    left = {'contact_id':'K1','account_id':'C02','mulai':'2025-01-01','selesai':'2025-12-31'}
    right = {'contact_id':'K1','account_id':'P01','mulai':'2026-01-01','selesai':''}
    dataset.tables['contact_employment_history'] = [left,right]
    result = candidates(dataset, 'C02', context)
    assert result[0]['path'] == ['C02','K1','P01','D1']
    assert result[0]['records'] == [left,right,deal]
    dataset.tables['contact_employment_history'] = []
    context['interactions'] = [{'interaction_id':'I1','isi':'Hubungkan diskusi ini dengan P01.'}]
    assert candidates(dataset, 'C02', context)[0]['kind'] == 'interaction'
    context['interactions'][0]['isi'] = 'Mereka berada di kota dan industri yang sama.'
    assert candidates(dataset, 'C02', context) == []


def test_record_backed_pipeline_appears_in_graph_and_evidence(data):
    prepared = copy.copy(data)
    prepared.tables = dict(data.tables)
    original = next(h for h in data.tables['contact_employment_history'] if h['account_id'] == 'C02')
    prepared.tables['contact_employment_history'] = data.tables['contact_employment_history'] + [dict(original, account_id='P01', mulai='2026-01-01', selesai='')]
    class Linked(ControlledJev):
        async def evaluate(self, state, questions):
            response = await super().evaluate(state, questions)
            if 'PC-1' in questions:
                response['answers']['PC-1']['noul'] = .95
                response['answers']['PC-3']['noul'] = .95
                response['answers']['PC-2'].update(choice='contact', probabilities={k: float(k == 'contact') for k in questions['PC-2']['criteria']})
            return response
    _, run = run_analysis(prepared, client=Linked())
    assert run['status'] == 'done', run.get('error') or run['review_reasons']
    assert run['result']['pipeline_supported']
    assert 'P01' in run['result']['evidence_ids'] and 'DL-001' in run['result']['evidence_ids']
    assert any(edge['target'] == 'P01' for edge in run['result']['evidence_paths'])
    assert all(check['passed'] for check in run['rubric']['EP-4']['checks'])


def test_question_review_and_invalid_graph(data):
    class Ambiguous(ControlledJev):
        async def evaluate(self, state, questions):
            response = await super().evaluate(state, questions)
            if 'BR-1' in questions:
                response['answers']['BR-1']['noul'] = .5
            return response
    _, run = run_analysis(data, client=Ambiguous())
    assert run['rubric']['BR-1']['status'] == 'review'
    assert any(r.get('question_id') == 'BR-1' and r['code'] == 'ambiguous_support' for r in run['review_reasons'])
    class Disconnected:
        hash = data.hash
        context = data.context
        def graph(self, aid):
            return dict(data.graph(aid), edges=[])
    _, run = run_analysis(Disconnected())
    assert run['status'] == 'review'
    assert run['rubric']['EP-4']['status'] == 'review'
    assert any(r['code'] == 'invalid_evidence' for r in run['review_reasons'])
