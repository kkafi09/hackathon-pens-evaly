"""Search only real graph entities, retaining the contexts in which they exist."""
from threading import RLock

_cache = {}
_lock = RLock()


def fields(value, prefix=''):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from fields(child, f'{prefix}.{key}' if prefix else key)
    elif isinstance(value, list):
        for child in value:
            yield from fields(child, prefix)
    elif value is not None and str(value).strip():
        yield prefix, str(value)


def search(dataset, query, limit=20, offset=0):
    with _lock:
        if dataset.hash not in _cache:
            entities = {}
            for aid in dataset.accounts:
                for node in dataset.graph(aid)['nodes']:
                    item = entities.setdefault(node['id'], {**node, 'account_ids': set()})
                    item['account_ids'].add(aid)
            indexed = []
            for item in entities.values():
                item['account_ids'] = sorted(item['account_ids'])
                indexed.append((item, list(fields(item['record']))))
            _cache.clear()
            _cache[dataset.hash] = indexed
        indexed = _cache[dataset.hash]
    term = query.strip().casefold()
    if not term:
        return {'items': [], 'total': 0, 'offset': offset, 'limit': limit}
    matches = []
    for node, values in indexed:
        rank, field, text = 3, '', ''
        if term == node['id'].casefold():
            rank, field, text = 0, 'id', node['id']
        elif term in node['label'].casefold() or term in node['id'].casefold():
            rank, field, text = 1, 'label', node['label']
        else:
            hit = next(((key, text) for key, text in values if term in text.casefold()), None)
            if hit:
                rank, (field, text) = 2, hit
        if rank < 3:
            pos = max(0, text.casefold().find(term) - 50)
            matches.append((rank, node['id'], {**node, 'matched_field': field,
                'snippet': ('…' if pos else '') + text[pos:pos+180],
                'accounts': [{'id': aid, 'name': dataset.accounts[aid]['nama']} for aid in node['account_ids']]}))
    matches.sort(key=lambda item: (item[0], item[1]))
    return {'items': [item[2] for item in matches[offset:offset+limit]], 'total': len(matches), 'offset': offset, 'limit': limit}
