"""Presentation-only localization. Records, answers and audit payloads are never translated."""
from copy import deepcopy
from pathlib import Path
import json
import re

CATALOG = json.loads((Path(__file__).resolve().parents[1] / 'locales' / 'en.json').read_text(encoding='utf-8'))
EN_MESSAGES = set(CATALOG.values())
TEMPLATES = [(key, value, re.compile('^' + '(.*?)'.join(re.escape(x) for x in re.split(r'\{\d+\}', key)) + '$', re.S))
             for key, value in CATALOG.items() if '{0}' in key and key != value]

EN_PATTERNS = [re.compile('^' + '(.*?)'.join(re.escape(x) for x in re.split(r'\{\d+\}', template)) + '$', re.S) for _, template, _ in TEMPLATES]


def text(value, lang='id', original=False):
    if not isinstance(value, str) or not value or lang == 'id':
        return value
    if value in EN_MESSAGES or any(pattern.fullmatch(value) for pattern in EN_PATTERNS):
        return value
    if value in CATALOG:
        return CATALOG[value]
    for key, template, pattern in TEMPLATES:
        match = pattern.fullmatch(value)
        if match:
            args = [text(v, lang) for v in match.groups()]
            return re.sub(r'\{(\d+)\}', lambda m: args[int(m[1])], template)
    # Review titles combine an immutable question ID and a known application label.
    if ' · ' in value:
        left, right = value.split(' · ', 1)
        if right in EN_MESSAGES:
            return value
        if right in CATALOG:
            return left + ' · ' + text(right, lang)
    return 'Original text: ' + value if original and not value.startswith('Original text: ') else value


def project(value, lang='id', kind='run'):
    """Return a translated copy, retaining all machine values and source bytes."""
    out = deepcopy(value)
    if lang == 'id':
        return out

    def fields(obj, keys, original=True):
        for key in keys:
            if isinstance(obj.get(key), str):
                obj[key] = text(obj[key], lang, original)

    def notes(obj, keys):
        for key in keys:
            if isinstance(obj.get(key), list):
                obj[key] = [text(v, lang, True) for v in obj[key]]

    def question(q):
        fields(q, ('text', 'label', 'note', 'description', 'title'))
        criteria = q.get('criteria')
        if isinstance(criteria, dict):
            q['criteria'] = {k: text(v, lang, True) for k, v in criteria.items()}
        elif isinstance(criteria, list):
            q['criteria'] = [text(v, lang, True) for v in criteria]
        for check in q.get('checks', []):
            fields(check, ('message',))

    def reason(r):
        fields(r, ('title', 'message'))

    def result(r):
        fields(r, ('title', 'intent_label', 'action_label'))
        notes(r, ('concerns',))
        calc = r.get('calculation') or {}
        notes(calc, ('assumptions',))
        fields(calc, ('formula',))
        summary = r.get('validation_summary') or {}
        fields(summary, ('title', 'summary', 'signal_type', 'estimate_label', 'action_label'))
        notes(summary, ('limitations',))
        score = r.get('expansion_score') or {}
        fields(score, ('note', 'unavailable_reason'))
        for group in score.get('groups', []):
            fields(group, ('label',))
        for p in score.get('parameters', []):
            fields(p, ('text',))
            notes(p, ('adjustments',))
        for q in (r.get('rubric') or {}).values():
            question(q)
        for item in r.get('review_reasons', []):
            reason(item)
        for step in r.get('next_steps', []):
            fields(step, ('label', 'action', 'expected_outcome'))
            if step.get('owner') == 'Owner belum ditentukan':
                step['owner'] = text(step['owner'], lang)
            notes(step, ('confirmations',))
            for verification in step.get('verification', []):
                fields(verification, ('message',))
        for edge in r.get('evidence_paths', []):
            fields(edge, ('label',), False)
        for candidate in r.get('pipeline_candidates', []):
            fields(candidate, ('label',), False)

    def run(r):
        fields(r, ('error', 'title', 'intent_label', 'action_label'))
        for q in (r.get('rubric') or {}).values():
            question(q)
        for step in r.get('steps', []):
            fields(step, ('title', 'description', 'error'))
            data = step.get('data') or {}
            fields(data, ('note',))
            for evaluation in data.get('evaluations', []):
                question(evaluation)
            for check in data.get('checks', []):
                fields(check, ('message',))
        for reason_item in r.get('review_reasons', []):
            reason(reason_item)
        if r.get('result'):
            result(r['result'])
        # Top-level next steps and report projections use the same presentation rules.
        wrapper = {key: r[key] for key in ('next_steps', 'validation_summary', 'expansion_score') if key in r}
        result(wrapper)
        r.update(wrapper)

    if kind == 'rubric':
        for q in out['questions']:
            question(q)
        for step in out['steps']:
            fields(step, ('title', 'description'))
    elif kind == 'graph':
        for edge in out.get('edges', []):
            fields(edge, ('label',), False)
        for node in out.get('nodes', []):
            if node.get('kind') in ('usage', 'release'):
                fields(node, ('label',), False)
    elif kind == 'context':
        notes(out, ('warnings',))
        for candidate in out.get('pipeline_candidates', []):
            fields(candidate, ('label',), False)
    elif isinstance(out, list):
        for r in out:
            run(r)
    elif kind == 'reports':
        for r in out.get('items', []):
            run(r)
    else:
        run(out)
    return out


def score_label(score, lang='id'):
    if score.get('display_value') is None:
        return score.get('unavailable_reason') or text('Skor belum tersedia', lang)
    value = f"{score['display_value']:.1f}"
    if lang == 'id':
        value = value.replace('.', ',')
    return text('Skor dukungan ekspansi', lang) + ': ' + value + '%'
