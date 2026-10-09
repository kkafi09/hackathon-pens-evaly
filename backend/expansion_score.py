"""Versioned policy score, not a calibrated probability or an extra model call."""
import math
from .rubric import BY_ID

VERSION = 'expansion-score-v1.0'
WEIGHTS = {'opportunity': 30, 'evidence': 30, 'financial': 15, 'readiness': 20, 'pipeline': 5}
LABELS = {'opportunity': 'Identifikasi peluang', 'evidence': 'Bukti dan keterlacakan',
          'financial': 'Estimasi nilai', 'readiness': 'Hambatan dan kesiapan', 'pipeline': 'Keterkaitan pipeline'}
SOURCES = {
    'crm': {'crm_accounts.csv', 'crm_contacts.csv', 'crm_deals.csv', 'contact_employment_history.csv', 'employees.csv'},
    'interactions': {'interactions.jsonl'}, 'usage': {'product_usage_daily.csv', 'feature_usage_monthly.csv'},
    'support': {'support_tickets.csv', 'bugs.csv', 'features.csv', 'releases.csv'},
    'contracts': {'contracts_billing.csv'}, 'decisions': {'decision_log.csv'},
}


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def valid_answer(definition, answer):
    if answer.get('type') != definition['type']:
        return False
    if definition['type'] == 'noul':
        return number(answer.get('noul')) and 0 <= answer['noul'] <= 1
    probabilities = answer.get('probabilities')
    expected = set(definition['criteria']) if definition['type'] == 'choice' else {str(k) for k in range(4)}
    return (isinstance(probabilities, dict) and set(probabilities) == expected
            and all(number(v) and 0 <= v <= 1 for v in probabilities.values())
            and abs(sum(probabilities.values()) - 1) <= .03
            and number(answer.get('confidence')) and 0 <= answer['confidence'] <= 1
            and (definition['type'] != 'choice' or (answer.get('choice') in expected and
                 probabilities[answer['choice']] >= max(probabilities.values()) - 1e-8))
            and (definition['type'] != 'score' or (number(answer.get('score')) and 0 <= answer['score'] <= 3)))


def display_score(value):
    if value is None:
        return None
    return 100.0 if value == 100 else min(round(value, 1), 99.9)


def score_label(score):
    if score.get('display_value') is None:
        return score.get('unavailable_reason') or 'Skor belum tersedia'
    return 'Skor dukungan ekspansi: ' + f"{score['display_value']:.1f}".replace('.', ',') + '%'


def markdown_score(score):
    lines = ['## Skor dukungan ekspansi', '', score_label(score), '', score['note'], '',
        f"Aturan: {score['version']} | Bobot kelompok aktif: {score['active_group_weight']}% | Jawaban valid: {score['evaluated_count']}/{score['applicable_count']}",
        f"Skor dasar: {score['base_score']} | Batas bukti: {score['cap_score']} | Pembatas: {', '.join(score['limiting_parameter_ids']) or 'Tidak ada'}", '',
        '### Bagaimana skor dihitung', '', 'Skor dasar = rata-rata kelompok berbobot; skor akhir = 100 × min(skor dasar/100, OI-1, EP-1, EP-4).', '']
    for group in score['groups']:
        lines.append(f"- {group['label']}: bobot {group['policy_weight']}%; bobot efektif {group['effective_weight']:.6f}; nilai {group['value']}; berlaku: {group['applicable']}")
    lines += ['', '| Parameter | Mentah | Efektif | Bobot efektif | Poin | Berlaku / pembatas | Sumber |',
              '| --- | --- | --- | --- | --- | --- | --- |']
    for p in score['parameters']:
        lines.append(f"| {p['id']} | {p['raw_value']} | {p['effective_value']} | {p['effective_weight']:.6f} | {p['weighted_points']} | {p['applicable']}: {'; '.join(p['adjustments'])} | {'; '.join(p['source_ids'])} |")
    return '\n'.join(lines) + '\n\n'


def build_score(run, entries, reasons, complete):
    result = run.get('result') or {}
    supporting = result.get('provenance') or []
    sources = {e['source'] for e in supporting if e.get('source')}
    evaluated = {e['id']: e for e in result.get('evaluated_provenance', [])}
    candidates = result.get('pipeline_candidates', [])
    candidate_kinds = {c['kind'] for c in candidates}
    answer = lambda key: entries.get(key, {}).get('answer') or {}
    pc2 = answer('PC-2')
    probs = pc2.get('probabilities') or {}
    neutral_pipeline = ('pipeline_candidates' in result and not candidates
        and answer('PC-1').get('noul', 1) <= .4 and pc2.get('choice') == 'none'
        and pc2.get('confidence', 0) >= .6 and probs
        and sum(abs(v - max(probs.values())) < 1e-8 for v in probs.values()) == 1
        and entries.get('PC-3', {}).get('applicable') is False)
    calc = result.get('calculation') or {}
    numeric_review = any(r['stage'] == 'financial' and (r.get('question_id') == 'outlet_candidate'
        or r['code'] in ('unconfirmed_outlets', 'missing_contract')) for r in reasons)
    finance_checks = entries.get('FE-1', {}).get('checks', [])
    unverified_inputs = (answer('OI-2').get('choice') == 'outlets' and
        (calc.get('gross_annual') is None or numeric_review or
         any(c.get('id') == 'verified_calculation' and c.get('passed') is False for c in finance_checks)))
    parameters, missing, extra_reasons = [], [], []
    if pc2.get('choice') in ('direct', 'contact', 'interaction') and pc2['choice'] not in candidate_kinds:
        extra_reasons.append({'code': 'unsupported_score_pipeline', 'stage': 'pipeline', 'question_id': 'PC-2',
            'title': 'PC-2 · Relasi pipeline', 'message': 'Jenis relasi pipeline yang dipilih belum didukung kandidat jalur record valid.',
            'source_ids': entries.get('PC-2', {}).get('source_ids', [])})
    for key, definition in BY_ID.items():
        q = entries.get(key, {})
        a = answer(key)
        applicable = q.get('applicable') is not False and not (neutral_pipeline and definition['group'] == 'pipeline')
        raw, effective, adjustments = None, None, []
        if not applicable:
            adjustments.append('Tidak berlaku pada agregasi: tidak ada hubungan pipeline terverifikasi.'
                               if neutral_pipeline and definition['group'] == 'pipeline' else q.get('note') or 'Parameter tidak berlaku pada hasil ini.')
        elif not valid_answer(definition, a) or q.get('status') not in ('done', 'review'):
            missing.append(key)
            adjustments.append('Belum ada jawaban akhir yang valid.')
            extra_reasons.append({'code': 'incomplete_validation', 'stage': definition['group'], 'question_id': key,
                'title': key + ' · ' + definition['text'], 'message': f'{key}: belum ada jawaban akhir yang valid untuk agregasi.',
                'source_ids': q.get('source_ids', [])})
        else:
            if definition['type'] == 'noul':
                raw = 1 - a['noul'] if key in ('BR-1', 'BR-4') else a['noul']
            elif definition['type'] == 'score':
                raw = a['confidence'] * sum(a['probabilities'][str(k)] * k / 3 for k in range(4))
            else:
                allowed = {
                    'OI-2': {'outlets', 'upgrade', 'feature', 'other'},
                    'FE-2': {'outlets', 'price', 'period', 'discount'}, 'BR-2': {'none'},
                    'PC-2': candidate_kinds - {'precedent', 'none', 'unclear'},
                }.get(key, set())
                if key == 'EP-2':
                    available = {evaluated[rid]['source'] for rid in q.get('source_ids', []) if rid in evaluated}
                    allowed = {category for category, files in SOURCES.items() if available & files}
                raw = a['confidence'] * sum(p for category, p in a['probabilities'].items() if category in allowed)
            raw = max(0.0, min(1.0, raw))
            effective = raw
            if key == 'PC-1' and not candidates:
                effective = 0.0
                adjustments.append('Tidak ada kandidat jalur pipeline berbasis record.')
            if key == 'EP-3' and len(sources) == 1:
                effective = min(effective, 2 / 3)
                adjustments.append('Satu sumber: kontribusi bukti maksimal 2/3.')
                if max(a['probabilities'], key=a['probabilities'].get) == '3':
                    extra_reasons.append({'code': 'score_evidence_conflict', 'stage': 'evidence', 'question_id': key,
                        'title': 'EP-3 · Kekuatan bukti', 'message': 'EP-3 menilai bukti dari beberapa sumber, tetapi snapshot pendukung hanya berasal dari satu sumber.',
                        'source_ids': [e['id'] for e in supporting]})
            if key == 'EP-5' and len(sources) < 2:
                effective = 0.0
                adjustments.append('Belum ada bukti pendukung lintas sumber.')
            if key in ('FE-1', 'FE-3') and unverified_inputs:
                effective = 0.0
                adjustments.append('Input estimasi outlet belum lolos pemeriksaan kode.')
        parameters.append({'id': key, 'group': definition['group'], 'text': definition['text'],
            'type': definition['type'], 'applicable': applicable, 'raw_value': raw, 'effective_value': effective,
            'answer': a or None, 'confidence': a.get('confidence'), 'source_ids': q.get('source_ids', []),
            'adjustments': adjustments, 'effective_weight': 0.0, 'weighted_points': None})
    groups = []
    for group, weight in WEIGHTS.items():
        active = [p for p in parameters if p['group'] == group and p['applicable']]
        groups.append({'id': group, 'label': LABELS[group], 'policy_weight': weight,
            'applicable': bool(active), 'parameter_count': len(active),
            'value': sum(p['effective_value'] or 0 for p in active) / len(active) if active else None})
    total_weight = sum(g['policy_weight'] for g in groups if g['applicable'])
    for group in groups:
        group['effective_weight'] = group['policy_weight'] / total_weight if group['applicable'] and total_weight else 0
        for p in parameters:
            if p['group'] == group['id'] and p['applicable']:
                p['effective_weight'] = group['effective_weight'] / group['parameter_count']
                p['weighted_points'] = 100 * p['effective_weight'] * p['effective_value'] if p['effective_value'] is not None else None
    base = sum((g['value'] or 0) * g['effective_weight'] for g in groups) * 100 if total_weight else None
    lookup = {p['id']: p for p in parameters}
    caps = {key: lookup[key]['effective_value'] for key in ('OI-1', 'EP-1', 'EP-4')}
    bad_evidence = any(r['code'] == 'invalid_evidence' for r in reasons) or any(
        c.get('id') in ('source_ids', 'original_quotes', 'graph_paths') and c.get('passed') is False
        for c in entries.get('EP-4', {}).get('checks', []))
    checks = {c['id']: c.get('passed') for c in entries.get('EP-4', {}).get('checks', [])}
    missing_checks = any(checks.get(key) is None for key in ('source_ids', 'original_quotes', 'graph_paths'))
    if missing_checks and result.get('has_opportunity'):
        extra_reasons.append({'code': 'incomplete_score_checks', 'stage': 'evidence', 'question_id': 'EP-4',
            'title': 'EP-4 · Pemeriksaan bukti', 'message': 'Pemeriksaan ID, kutipan, atau keterhubungan graph belum lengkap untuk menerbitkan skor.',
            'source_ids': entries.get('EP-4', {}).get('source_ids', [])})
    unavailable = ('Tidak tersedia hasil akhir.' if run.get('status') not in ('done', 'review') else
        'Belum ditemukan sinyal ekspansi dari data tersedia.' if not result.get('has_opportunity') else
        'Skor tidak dipublikasikan karena pemeriksaan bukti tidak valid.' if bad_evidence else
        'Skor belum dapat dihitung — validasi belum lengkap.' if not complete or missing or missing_checks or any(v is None for v in caps.values()) else None)
    ceiling = min(caps.values()) * 100 if all(v is not None for v in caps.values()) else None
    value = min(base, ceiling) if unavailable is None else None
    if value == 100 and not all(p['effective_value'] == 1 for p in parameters if p['applicable']):
        value = math.nextafter(100.0, 0.0)
    limiting = [key for key, v in caps.items() if v is not None and ceiling is not None and abs(v * 100 - ceiling) < 1e-8] if base is not None and ceiling is not None and ceiling < base else []
    return {'version': VERSION, 'value': value, 'display_value': display_score(value), 'unavailable_reason': unavailable,
        'complete': complete and not missing and not missing_checks,
        'base_score': base if not missing else None, 'cap_score': ceiling, 'limiting_parameter_ids': limiting,
        'active_group_weight': total_weight, 'applicable_count': sum(p['applicable'] for p in parameters),
        'evaluated_count': sum(p['applicable'] and p['effective_value'] is not None for p in parameters),
        'groups': groups, 'parameters': parameters,
        'note': 'Dihitung dari rubrik validasi; bukan probabilitas deal menang. Bobot adalah kebijakan awal, belum dikalibrasi terhadap hasil deal.'}, extra_reasons
