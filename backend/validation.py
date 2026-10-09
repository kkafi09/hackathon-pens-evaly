"""Deterministic v2 conclusions from stored rubric answers and evidence only."""
from .rubric import BY_ID, review_reasons, interpretation

VERSION = 'validation-v1.0'


def summarize(run):
    result = run.get('result')
    if run.get('rubric_version') != 'expansion-v2.0' or not result:
        return
    if run.get('status') not in ('done', 'review'):
        result.pop('validation_summary', None)
        result.pop('expansion_score', None)
        return
    entries = run.get('rubric') or result.get('rubric') or {}
    reasons = list(run.get('review_reasons', []))
    supporting = result.get('provenance', [])
    sources = {e['source'] for e in supporting if e.get('source')}
    has_signal = bool(result.get('has_opportunity'))
    limitations = []
    missing = []

    def add(code, key, message, ids=None):
        q = entries.get(key, {})
        reasons.append({'code': code, 'question_id': key, 'stage': BY_ID[key]['group'],
                        'title': key + ' · ' + BY_ID[key]['text'], 'message': message,
                        'source_ids': list(ids if ids is not None else q.get('source_ids', []))})

    def answer(key):
        return entries.get(key, {}).get('answer') or {}

    for key, definition in BY_ID.items():
        q = entries.get(key)
        if q and q.get('applicable') is False:
            continue
        if not q or not q.get('answer') or q.get('status') not in ('done', 'review'):
            missing.append(key)
            if q:
                q['label'] = 'Validasi tersimpan belum lengkap'
            continue
        reasons.extend(review_reasons(definition, q['answer'], q.get('source_ids', [])))
        if q['status'] == 'review' and not any(r.get('question_id') == key for r in reasons):
            add('stored_review', key, f'{key}: penilaian tersimpan perlu ditinjau; periksa jawaban dan sumber terkait.')

    # Older v2 runs may lack derived reasons; recover auxiliary decisions from snapshots.
    for call in run.get('calls', []):
        for key in ('outlet_candidate', 'action'):
            value = (call.get('response') or {}).get('answers', {}).get(key)
            if value:
                recovered = review_reasons({'id': key, 'group': 'financial' if key == 'outlet_candidate' else 'result',
                    'text': 'Pemilihan angka outlet' if key == 'outlet_candidate' else 'Tindak lanjut', 'type': 'choice'},
                    value, call.get('source_ids', []))
                for reason in recovered:
                    if not any(r['code'] == reason['code'] and r['stage'] == reason['stage'] and
                               r.get('question_id') in (key, None) for r in reasons):
                        reasons.append(reason)

    if has_signal:
        for key in ('EP-1', 'EP-4'):
            if answer(key).get('noul', 1) <= .4:
                add('unsupported_recommendation', key, f'{key}: bukti atau relasi rekomendasi belum mendukung.')
        calc = result.get('calculation') or {}
        estimation_required = answer('OI-2').get('choice') == 'outlets' or calc.get('gross_annual') is not None
        for key in ('FE-1', 'FE-3'):
            if estimation_required and entries.get(key, {}).get('applicable') is not False and answer(key).get('noul', 1) <= .4:
                add('unverified_financial', key, f'{key}: estimasi nilai belum didukung input yang terverifikasi.')
        if answer('OI-2').get('choice') == 'outlets' and calc.get('gross_annual') is None:
            if not any(r['code'] in ('unconfirmed_outlets', 'missing_contract') for r in reasons):
                add('unverified_financial', 'FE-1', 'Input estimasi outlet belum terverifikasi; nilai belum dihitung.')
        for check in entries.get('EP-4', {}).get('checks', []):
            if check.get('id') in ('source_ids', 'original_quotes', 'graph_paths') and check.get('passed') is False:
                key = 'EP-4' if check['id'] == 'graph_paths' else 'EP-1'
                add('invalid_evidence', key, check['message'], check.get('source_ids', []))
        if len(sources) == 1:
            limitations.append('Bukti pendukung berasal dari satu sumber; validasi lintas sumber belum terpenuhi.')
        elif not supporting:
            limitations.append('Snapshot bukti pendukung belum tersedia.')
        elif answer('EP-5').get('noul', 1) <= .4:
            limitations.append('Beberapa sumber tersedia, tetapi relevansi bukti lintas sumber belum mendukung rekomendasi.')
        if len(sources) < 2 and answer('EP-5').get('noul', 0) >= .6:
            add('source_count_conflict', 'EP-5', 'EP-5 mendukung bukti lintas sumber, tetapi snapshot pendukung memiliki kurang dari dua sumber berbeda.', [e['id'] for e in supporting])

    incomplete = (bool(missing) or 'provenance' not in result or not result.get('evaluated_provenance')
                  or (has_signal and (not supporting or not sources)))
    if incomplete:
        limitations.append('Validasi tersimpan belum lengkap')
        for key in missing:
            add('incomplete_validation', key, f'{key}: validasi tersimpan belum lengkap; belum ada jawaban akhir yang dapat diperiksa.')
        if not missing:
            add('incomplete_validation', 'EP-1', 'Validasi tersimpan belum lengkap: snapshot provenance tidak tersedia.')

    from .expansion_score import build_score
    score, score_reasons = build_score(run, entries, reasons, complete=not incomplete)
    result['expansion_score'] = score
    reasons.extend(score_reasons)
    incomplete = incomplete or not score['complete']
    if incomplete and 'Validasi tersimpan belum lengkap' not in limitations:
        limitations.append('Validasi tersimpan belum lengkap')
    # Preserve the original reason text while making repeated replay derivation idempotent.
    unique = {}
    for reason in reasons:
        identity = (reason['code'], reason.get('question_id'), reason['stage'], tuple(reason.get('source_ids', [])))
        unique.setdefault(identity, reason)
    reasons = list(unique.values())
    status = 'review' if reasons or run['status'] == 'review' else 'done'
    for reason in reasons:
        key = reason.get('question_id')
        if key in entries and entries[key].get('applicable') is not False:
            entries[key]['status'] = 'review'
        for step in run.get('steps', []):
            if step['id'] in (reason['stage'], 'result') and step['status'] == 'done':
                step['status'] = 'review'
    title = ('Hasil perlu ditinjau' if status == 'review' else 'Sinyal ekspansi teridentifikasi'
             if has_signal else 'Belum ditemukan sinyal ekspansi dari data tersedia')
    text = ('Sinyal ekspansi ditemukan; sebagian hasil belum terverifikasi.' if status == 'review' and has_signal
            else 'Hasil validasi belum cukup untuk menyimpulkan sinyal ekspansi.' if status == 'review'
            else 'Evaluasi selesai tanpa pemicu review; hasil tetap bergantung pada bukti yang tersedia.')
    calc = result.get('calculation') or {}
    finance_review = any(r['stage'] == 'financial' for r in reasons)
    summary = {
        'version': VERSION, 'status': status, 'title': title, 'summary': text,
        'signal_type': interpretation(BY_ID['OI-2'], answer('OI-2')) if answer('OI-2').get('choice') in BY_ID['OI-2']['criteria'] else 'Belum terverifikasi',
        'review_parameter_ids': sorted({r['question_id'] for r in reasons if r.get('question_id')}),
        'supporting_record_count': len({(e.get('source'), e['id']) for e in supporting}),
        'source_count': len(sources),
        'evaluated_record_count': len({(e.get('source'), e['id']) for e in result.get('evaluated_provenance', [])}),
        'limitations': limitations, 'complete': not incomplete,
        'estimate_label': 'Belum dihitung' if calc.get('gross_annual') is None else 'Skenario belum terverifikasi' if finance_review else 'Skenario annualized',
        'action_label': ('Usulan setelah verifikasi: ' if status == 'review' else '') + (result.get('action_label') or 'Lengkapi informasi'),
    }
    run['status'] = status
    run['review_reasons'] = result['review_reasons'] = reasons
    result['validation_summary'] = summary
    if run.get('rubric'):
        result['rubric'] = entries
