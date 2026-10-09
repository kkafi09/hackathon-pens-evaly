"""Source snapshots, not explanations of the model's internal reasoning."""
import copy
import hashlib
import json


def fingerprint(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


class EvidenceIndex:
    def __init__(self, dataset, context):
        self.items = {}
        self.records = {}
        self.aid = context['account']['account_id']
        for node in dataset.graph(self.aid)['nodes']:
            self.add(node['id'], node['record'], node['source'], node['label'], node['id'])
        sources = {
            'contacts': ('contact_id', 'crm_contacts.csv'), 'interactions': ('interaction_id', 'interactions.jsonl'),
            'contracts': ('contract_id', 'contracts_billing.csv'), 'tickets': ('ticket_id', 'support_tickets.csv'),
            'deals': ('deal_id', 'crm_deals.csv'), 'decisions': ('decision_id', 'decision_log.csv'),
            'precedents': ('decision_id', 'decision_log.csv'), 'features': ('feature_id', 'features.csv'),
            'bugs': ('bug_id', 'bugs.csv'), 'releases': ('versi', 'releases.csv'),
            'employment_history': (None, 'contact_employment_history.csv'),
            'outlets': ('outlet_id', 'outlets.csv'), 'feature_usage': (None, 'feature_usage_monthly.csv'),
            'usage': (None, 'product_usage_daily.csv'),
        }
        for table, (key, source) in sources.items():
            for record in context.get(table, []):
                rid = str(record[key]) if key else f'{table}:{hashlib.sha256(fingerprint(record).encode()).hexdigest()[:16]}'
                if table == 'releases':
                    rid = f'release:{rid}'
                node_id = rid if rid in self.items else None
                if table == 'usage':
                    node_id = f'usage:{self.aid}'
                self.add(rid, record, source, record.get('nama') or record.get('subjek') or record.get('judul') or rid, node_id)

    def add(self, rid, record, source, label, node_id):
        self.items[rid] = {'id': rid, 'node_id': node_id, 'source': source, 'label': label,
                           'record': copy.deepcopy(record), 'role': 'context', 'question_refs': []}
        self.records[fingerprint(record)] = rid

    def collect(self, state, questions=()):
        found = set()
        def visit(value):
            if isinstance(value, dict):
                rid = self.records.get(fingerprint(value))
                if rid:
                    found.add(rid)
                for child in value.values():
                    visit(child)
            elif isinstance(value, list):
                for child in value:
                    visit(child)
        visit(state)
        return [dict(copy.deepcopy(self.items[rid]), question_refs=list(questions)) for rid in sorted(found)]


def merge_evidence(*groups):
    merged = {}
    for group in groups:
        for item in group:
            if item['id'] not in merged:
                merged[item['id']] = copy.deepcopy(item)
            else:
                merged[item['id']]['question_refs'] = sorted(set(merged[item['id']]['question_refs'] + item['question_refs']))
                merged[item['id']].setdefault('assessments', {}).update(item.get('assessments', {}))
    return list(merged.values())


def gateway(run):
    return run.get('gateway', 'typesafe')
