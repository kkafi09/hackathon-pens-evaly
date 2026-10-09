"""Dependency-ordered execution of the MVP rubric, with stored source snapshots."""
import copy
import re
from . import rubric
from .provenance import EvidenceIndex, merge_evidence


async def execute(analyzer, run):
    # Import here to keep shared client/calculation helpers independent of this executor.
    from .analysis import (POLICY, CLASSIFICATION, ACTIONS, ACTION_LABELS, now,
                           validate_response, is_uncertain, number_candidates, calculate)
    from .explanations import explain_run
    stage = run['steps'][0]
    index = None
    run.setdefault('rubric', rubric.pending())
    run['review_reasons'] = []

    def save():
        analyzer.store.save(run)

    def begin(key):
        nonlocal stage
        stage = next(s for s in run['steps'] if s['id'] == key)
        stage['status'] = 'running'
        stage.setdefault('data', None)
        save()

    def finish(data=None):
        if data is not None:
            stage['data'] = data
        stage['status'] = 'review' if any(r['stage'] == stage['id'] for r in run['review_reasons']) else 'done'
        save()

    def reason(code, message, ids=(), key=None):
        run['review_reasons'].append({'code': code, 'stage': stage['id'], 'question_id': key,
                                      'title': key or stage['title'], 'message': message, 'source_ids': list(ids)})
        if key in run['rubric']:
            run['rubric'][key]['status'] = 'review'

    async def ask(state, questions):
        evidence = index.collect(state, questions)
        stage['provenance'] = merge_evidence(stage.get('provenance', []), evidence)
        stage['active_source_ids'] = [e['id'] for e in evidence]
        stage['question_count'] = stage.get('question_count', 0) + len(questions)
        save()  # Persist the exact input set before the network request.
        response = validate_response(await analyzer.client.evaluate(state, questions), questions)
        answers = response['answers']
        for entry in evidence:
            entry['assessments'] = {q: answers[q] for q in questions}
        stage['provenance'] = merge_evidence(stage['provenance'], evidence)
        run['model'] = response['model']
        if response['model'] not in run['models']:
            run['models'].append(response['model'])
        run['calls'].append({'stage': stage['id'], 'at': now(), 'state': copy.deepcopy(state),
                             'source_ids': [e['id'] for e in evidence], 'questions': questions,
                             'response': response, 'gateway': 'openrouter', 'provider': response.get('provider'),
                             'response_id': response.get('id'), 'cost': response.get('usage', {}).get('cost'),
                             'provenance': evidence})
        save()
        return answers

    async def group(key, state, checks=(), not_applicable=(), note=''):
        definitions = [q for q in rubric.QUESTIONS if q['group'] == key]
        source_ids = [e['id'] for e in index.collect(state)]
        for q in definitions:
            run['rubric'][q['id']].update(status='running', source_ids=source_ids, checks=list(checks))
        save()
        instructions = POLICY + (
            'Distinguish explicit customer intent from internal sales suggestions. '
            'Code calculates money and dates; do not recompute them. Potential risk is not an explicit prerequisite. '
            'Precedents from another account are comparisons, not actual pipeline relationships or approvals. '
            'If no opportunity or recommendation exists, do not invent one. '
            'Use only the supplied source records, code checks and draft; negative answers can be valid. ')
        questions = {q['id']: {'type': q['type'], 'criteria': q['criteria'],
                               'instructions': instructions + q['text']} for q in definitions}
        answers = await ask(state, questions)
        for q in definitions:
            answer = answers[q['id']]
            applicable = q['id'] not in not_applicable
            reasons = rubric.review_reasons(q, answer, source_ids) if applicable else []
            run['review_reasons'].extend(reasons)
            needs_review = any(r.get('question_id') == q['id'] for r in run['review_reasons'])
            run['rubric'][q['id']].update(answer=answer, applicable=applicable,
                status='review' if needs_review and applicable else 'done' if applicable else 'skipped',
                label=rubric.interpretation(q, answer), source_ids=source_ids,
                checks=list(checks), note=note if not applicable else '')
        stage['data'] = {**(stage.get('data') or {}), 'evaluations': [run['rubric'][q['id']] for q in definitions], 'checks': list(checks)}
        save()
        return answers

    try:
        run['status'] = 'running'
        begin('context')
        c = analyzer.dataset.context(run['account_id'])
        index = EvidenceIndex(analyzer.dataset, c)
        stage['provenance'] = index.collect(c)
        run['account_name'] = c['account']['nama']
        finish({k: c[k] for k in ('source_counts', 'snapshot', 'warnings', 'usage', 'owner', 'contacts', 'contracts')})

        begin('opportunity')
        messages, classified = c['interactions'], []
        for offset in range(0, len(messages), 8):
            batch = messages[offset:offset+8]
            questions = {m['interaction_id']: {'type': 'choice', 'criteria': CLASSIFICATION,
                'instructions': POLICY + f"Classify the primary purpose of messages.{m['interaction_id']}, using its supplied thread."} for m in batch}
            answers = await ask({'messages': {m['interaction_id']: m for m in batch}, 'reply_context': messages}, questions)
            classified.extend({'interaction_id': key, **value} for key, value in answers.items())
            for key, value in answers.items():
                if is_uncertain(value) or value['choice'] == 'unclear':
                    reason('unclear_classification', f'{key}: klasifikasi pesan belum cukup pasti; periksa konteks percakapan.', [key])
            stage['data'] = {'classifications': classified}
            save()
        chosen_ids = {a['interaction_id'] for a in classified if a['choice'] == 'expansion' and not is_uncertain(a)}
        expansion = [m for m in messages if m['interaction_id'] in chosen_ids and m['customer_sender']]
        related_ids = {m['interaction_id'] for m in expansion}
        # Complete the connected reply component, including ancestors and deeper replies.
        while True:
            extended = related_ids | {m['interaction_id'] for m in messages if m['membalas_id'] in related_ids} | {
                m['membalas_id'] for m in messages if m['interaction_id'] in related_ids and m['membalas_id']}
            if extended == related_ids:
                break
            related_ids = extended
        thread = [m for m in messages if m['interaction_id'] in related_ids]
        oi = await group('opportunity', {'account': c['account'], 'messages': messages, 'expansion_messages': expansion,
                                        'thread': thread, 'deals': c['deals'], 'classifications': classified})
        has_opportunity = bool(expansion) and oi['OI-1']['noul'] >= .6 and oi['OI-2']['choice'] not in ('none', 'unclear')
        if (oi['OI-1']['noul'] >= .6 and not expansion) or (expansion and oi['OI-1']['noul'] <= .4):
            reason('conflicting_signal', 'Sinyal Jev dan bukti pesan pelanggan tidak konsisten. Konfirmasi sebelum menyatakan peluang.', related_ids, 'OI-1')
        intent = oi['OI-3']
        intent_label = rubric.interpretation(rubric.BY_ID['OI-3'], intent)
        finish()

        begin('financial')
        number_options = number_candidates(expansion) if has_opportunity else []
        selected = None
        if number_options:
            options = {n['id']: f"{n['count']} outlet TAMBAHAN; kutipan {n['interaction_id']}: {n['quote']}" for n in number_options}
            options['uncertain'] = 'Angka ambigu, bukan tambahan, rencana bertentangan, atau sudah termasuk kontrak.'
            numeric = await ask({'candidates': number_options, 'messages': expansion, 'contract': c['contracts'], 'snapshot': c['snapshot']}, {
                'outlet_candidate': {'type': 'choice', 'criteria': options, 'instructions': POLICY +
                    'Select the quoted number representing NEW additional outlets. Do not add numbers or compare dates. Choose uncertain for unresolved independent plans or already contracted counts.'}})
            answer = numeric['outlet_candidate']
            run['review_reasons'].extend(rubric.review_reasons(
                {'id': 'outlet_candidate', 'group': 'financial', 'type': 'choice', 'text': 'Pemilihan angka outlet'},
                answer, sorted(related_ids)))
            if not is_uncertain(answer):
                selected = next((n for n in number_options if n['id'] == answer['choice']), None)
        calc = calculate(c, selected)
        finance_checks = [{'id': 'verified_calculation', 'passed': calc['gross_annual'] is not None,
                           'message': 'Kode memerlukan angka tambahan terpilih dan tepat satu kontrak aktif. Periode annualized 12 bulan; diskon adalah skenario.', 'source_ids': calc['source_ids']}]
        if has_opportunity and oi['OI-2']['choice'] == 'outlets' and not selected:
            reason('unconfirmed_outlets', 'Jumlah outlet tambahan belum dapat dipastikan; estimasi belum dihitung.', related_ids, 'FE-1')
        if has_opportunity and selected and calc['gross_annual'] is None:
            reason('missing_contract', 'Kontrak aktif atau input harga belum dapat diverifikasi; estimasi belum dihitung.', calc['source_ids'], 'FE-3')
        await group('financial', {'expansion_messages': expansion, 'contracts': c['contracts'], 'candidates': number_options,
                                  'selected': selected, 'calculation': calc, 'code_checks': finance_checks}, finance_checks,
                    not_applicable=() if has_opportunity else ('FE-1', 'FE-2', 'FE-3'), note='Belum ada peluang terverifikasi untuk dihitung.')
        finish()

        begin('readiness')
        ticket_answers = []
        if has_opportunity:
            for offset in range(0, len(c['tickets']), 6):
                batch = c['tickets'][offset:offset+6]
                questions = {t['ticket_id']: {'type': 'noul', 'instructions': POLICY +
                    f"Does the evidence explicitly state that tickets.{t['ticket_id']} MUST be resolved before expansion? Open status or a request alone is not a prerequisite.",
                    'criteria': {'true': 'Explicit customer prerequisite.', 'false': 'No explicit prerequisite.'}} for t in batch}
                answers = await ask({'tickets': {t['ticket_id']: t for t in batch}, 'expansion': expansion,
                                     'bugs': c['bugs'], 'features': c['features']}, questions)
                ticket_answers.extend({'ticket_id': key, **answer} for key, answer in answers.items())
        stage['data'] = {'tickets': ticket_answers}
        br = await group('readiness', {k: c[k] for k in ('account', 'contacts', 'contracts', 'tickets', 'bugs', 'features', 'usage')} |
                         {'expansion_messages': expansion, 'thread': thread, 'ticket_assessments': ticket_answers},
                         not_applicable=() if has_opportunity else ('BR-1', 'BR-2', 'BR-3'), note='Tidak ada peluang terverifikasi untuk dinilai kesiapannya.')
        finish()

        begin('pipeline')
        links = c['pipeline_candidates']
        pipeline_checks = [{'id': 'candidate_paths', 'passed': bool(links), 'message': f'{len(links)} kandidat jalur berbasis ID/record; preseden hanya pembanding.',
                            'source_ids': [x['deal']['deal_id'] for x in links]}]
        pc = await group('pipeline', {'account': c['account'], 'candidates': links, 'history': c['pipeline_history'],
                                      'deals': c['pipeline_deals'], 'accounts': c['pipeline_accounts'], 'precedents': c['precedents']}, pipeline_checks,
                         not_applicable=() if links else ('PC-3',), note='Tidak ada jalur pipeline berbasis record untuk direkomendasikan.')
        valid_pipeline = pc['PC-1']['noul'] >= .6 and not is_uncertain(pc['PC-2']) and pc['PC-2']['choice'] in {x['kind'] for x in links}
        if pc['PC-1']['noul'] >= .6 and not valid_pipeline:
            reason('unsupported_pipeline', 'Penilaian relasi pipeline belum didukung kandidat jalur yang valid; tidak ditampilkan sebagai hubungan fakta.', key='PC-1')
        action = None
        if has_opportunity:
            actions = await ask({k: c[k] for k in ('account', 'contacts', 'owner', 'contracts', 'tickets', 'deals', 'decisions', 'precedents')} |
                                {'expansion': expansion, 'thread': thread, 'intent': intent, 'readiness': br,
                                 'ticket_assessments': ticket_answers, 'calculation': calc, 'pipeline': links if valid_pipeline and pc['PC-3']['noul'] >= .6 else []},
                                {'action': {'type': 'choice', 'criteria': ACTIONS, 'instructions': POLICY +
                                    'Choose the best next step. Resolve requires an explicit customer prerequisite, not merely a potential risk. Precedents are not approval. Do not promise unavailable features or discounts.'}})
            action = actions['action']
            if action['choice'] == 'resolve' and not any(a['noul'] >= .6 for a in ticket_answers):
                reason('unverified_prerequisite', 'Rekomendasi penyelesaian hambatan belum memiliki syarat ekspansi eksplisit yang terverifikasi.', related_ids)
            if is_uncertain(action):
                # The final result stage owns the action's uncertainty, as with legacy runs.
                value = action['confidence']
                message = f'Confidence rekomendasi {ACTION_LABELS[action["choice"]].lower()} {value:.0%}, di bawah batas aplikasi 60%.' if value < .6 else 'Probabilitas tertinggi pilihan tindak lanjut seri. Periksa distribusi dan bukti.'
                run['review_reasons'].append({'code': 'low_confidence' if value < .6 else 'tied_choices', 'stage': 'result',
                    'title': 'Rekomendasi tindak lanjut', 'message': message,
                    'confidence': value, 'threshold': .6, 'source_ids': sorted(related_ids)})
        finish()

        evaluated = merge_evidence(*(s.get('provenance', []) for s in run['steps']))
        lookup = {e['id']: e for e in evaluated}
        evidence_ids = sorted(related_ids | set(calc['source_ids'])) if has_opportunity else []
        if has_opportunity and valid_pipeline and pc['PC-3']['noul'] >= .6:
            selected_links = [link for link in links if link['kind'] == pc['PC-2']['choice']]
            path_ids = {rid for link in selected_links for rid in link['path']}
            path_ids.update(e['id'] for e in index.collect({'links': selected_links}))
            evidence_ids = sorted(set(evidence_ids) | path_ids)
        supporting = []
        for rid in evidence_ids:
            if rid not in lookup:
                continue
            entry = copy.deepcopy(lookup[rid])
            entry['role'] = 'expansion' if rid in related_ids else 'calculation' if rid in calc['source_ids'] else 'context'
            if selected and rid == selected['interaction_id']:
                entry.update(quote=selected['quote'], fields=['isi'])
            elif entry['source'] == 'contracts_billing.csv':
                entry['fields'] = ['outlet_kontrak', 'harga_per_outlet_bulan', 'diskon_pct', 'batas_outlet_paket']
            supporting.append(entry)
        concerns = [f"{m['interaction_id']}: Belum ada balasan tercatat" for m in expansion if not m['reply_count']]
        if not c['deals']:
            concerns.append('Belum ada deal tercatat untuk akun ini; peluang bukan booking CRM.')
        if not c['decisions']:
            concerns.append('Tidak ada keputusan khusus akun; preseden akun lain hanya pembanding.')
        for email in expansion:
            if re.search(r'(?:sudah.*tiket|tiket.*sudah)', email['isi'], re.I) and c['tickets'] and all(t['dibuat'] > email['tanggal'] for t in c['tickets']):
                concerns.append(f"{email['interaction_id']} menyebut tiket sudah dikirim, tetapi tiket tersedia bertanggal setelah email; perlu konfirmasi.")
        result = {'title': 'Peluang ekspansi teridentifikasi' if has_opportunity else 'Belum ditemukan peluang dari data tersedia',
                  'has_opportunity': has_opportunity, 'intent': intent if has_opportunity else None,
                  'intent_label': intent_label if has_opportunity else None, 'calculation': calc, 'action': action,
                  'action_label': ACTION_LABELS[action['choice']] if action else 'Lengkapi informasi', 'owner': c['owner'],
                  'concerns': concerns, 'evidence_ids': evidence_ids, 'ticket_assessments': ticket_answers,
                  'candidates': number_options, 'provenance': supporting, 'evaluated_provenance': evaluated,
                  'source_evidence': [m for m in messages if m['interaction_id'] in evidence_ids],
                  'precedents': c['precedents'] if has_opportunity else [], 'pipeline_candidates': links,
                  'pipeline_supported': valid_pipeline}

        begin('evidence')
        graph = analyzer.dataset.graph(run['account_id'])
        proof_nodes = {run['account_id']} | {e['node_id'] for e in supporting if e['node_id']}
        proof_edges = [e for e in graph['edges'] if e['source'] in proof_nodes and e['target'] in proof_nodes]
        reached = {run['account_id']}
        while True:
            connected = reached | {e['target'] for e in proof_edges if e['source'] in reached} | {e['source'] for e in proof_edges if e['target'] in reached}
            if connected == reached:
                break
            reached = connected
        checks = [
            {'id': 'source_ids', 'passed': all(rid in index.items for rid in evidence_ids), 'message': 'Semua ID bukti harus tersedia pada snapshot sumber.', 'source_ids': evidence_ids},
            {'id': 'original_quotes', 'passed': all(not e.get('quote') or e['quote'] in e['record'].get('isi', '') for e in supporting),
             'message': 'Kutipan harus merupakan substring sumber asli.', 'source_ids': evidence_ids},
            {'id': 'graph_paths', 'passed': proof_nodes <= reached, 'message': 'Jalur rekomendasi harus terhubung melalui relasi graph yang memiliki record sumber.', 'source_ids': evidence_ids},
            {'id': 'multiple_sources', 'passed': len({e['source'] for e in supporting}) > 1, 'message': 'Jumlah sumber berbeda pada bukti pendukung; bukan jaminan relevansi semantik.', 'source_ids': evidence_ids},
        ]
        # Do not persist a final result until its evidence has been evaluated.
        draft = {k: result[k] for k in ('title', 'has_opportunity', 'intent_label', 'action_label', 'calculation', 'evidence_ids')}
        ep = await group('evidence', {'draft': draft, 'supporting_records': [e['record'] for e in supporting],
                                 'record_snapshots': supporting, 'relations': proof_edges, 'code_checks': checks}, checks,
                    not_applicable=() if has_opportunity else ('EP-1', 'EP-3', 'EP-4', 'EP-5'), note='Tidak ada rekomendasi ekspansi untuk divalidasi.')
        if has_opportunity:
            for key in ('EP-1', 'EP-4'):
                if ep[key]['noul'] <= .4:
                    reason('unsupported_recommendation', f'{key}: bukti atau relasi rekomendasi dinilai belum mendukung. Tinjau jalur sumber sebelum memakai rekomendasi.', evidence_ids, key)
            for check in checks[:3]:
                if not check['passed']:
                    reason('invalid_evidence', check['message'], check['source_ids'], 'EP-4' if check['id'] == 'graph_paths' else 'EP-1')
        result['evidence_paths'] = proof_edges
        finish()

        begin('result')
        result['rubric'] = copy.deepcopy(run['rubric'])
        result['evaluated_provenance'] = merge_evidence(*(s.get('provenance', []) for s in run['steps']))
        run['result'] = result
        finish(result)
        run['status'] = 'review' if run['review_reasons'] else 'done'
    except Exception as exc:
        stage['status'] = 'failed'
        run['status'] = 'failed'
        run['error'] = str(exc) if isinstance(exc, ValueError) else 'Analisis gagal karena kesalahan internal. Periksa log backend.'
        if not isinstance(exc, ValueError):
            import logging
            logging.exception('Analysis failed: %s', run['id'])
        for entry in run['rubric'].values():
            if entry['status'] in ('running', 'waiting'):
                entry['status'] = 'failed' if entry['status'] == 'running' else 'skipped'
                entry['note'] = 'Evaluasi terhenti; belum ada jawaban valid.'
        for step in run['steps']:
            if step['status'] == 'waiting':
                step['status'] = 'skipped'
    finally:
        run['finished_at'] = now()
        explain_run(run)
        save()
