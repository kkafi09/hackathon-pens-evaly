"""Readable summaries derived only from stored decisions and workflow rules."""
REVIEW_THRESHOLD = .6
ACTION_NAMES = {'discovery': 'discovery kebutuhan', 'proposal': 'menyiapkan penawaran',
                'resolve': 'menyelesaikan syarat ekspansi', 'stakeholder': 'konfirmasi stakeholder',
                'insufficient': 'melengkapi informasi'}


def explain_run(run):
    modern = run.get('rubric_version') == 'expansion-v2.0'
    reasons = list(run.get('review_reasons', [])) if modern else []
    steps = run.get('steps', [])
    result = run.get('result') or {}

    def uncertain(answer, stage, subject, ids=()):
        if not isinstance(answer, dict):
            return
        probs = answer.get('probabilities', {})
        confidence = answer.get('confidence')
        if isinstance(confidence, (float, int)) and confidence < REVIEW_THRESHOLD:
            reasons.append({'code': 'low_confidence', 'stage': stage, 'title': subject,
                            'message': f'Confidence {subject.lower()} {confidence:.0%}, di bawah batas aplikasi {REVIEW_THRESHOLD:.0%}. Pilihan ini perlu diperiksa oleh owner akun.',
                            'confidence': confidence, 'threshold': REVIEW_THRESHOLD, 'source_ids': list(ids)})
        top = max(probs.values(), default=0)
        if probs and sum(abs(value-top) < 1e-8 for value in probs.values()) > 1:
            reasons.append({'code': 'tied_choices', 'stage': stage, 'title': subject,
                            'message': 'Beberapa pilihan memiliki probabilitas tertinggi yang sama. Belum ada satu pilihan yang paling kuat.', 'source_ids': list(ids)})

    for step in steps:
        if modern:
            break  # v2 records concrete reasons at the point where each check fires.
        if step['status'] != 'review':
            continue
        before = len(reasons)
        stage = step['id']
        data = step.get('data') or {}
        if stage == 'classification':
            for answer in data.get('classifications', []):
                ids = [answer['interaction_id']]
                uncertain(answer, stage, f"Klasifikasi pesan {ids[0]}", ids)
                if answer.get('choice') == 'unclear':
                    reasons.append({'code': 'unclear_classification', 'stage': stage,
                                    'title': 'Tujuan pesan belum jelas', 'message': f'{ids[0]} belum dapat diklasifikasikan dengan jelas. Periksa isi dan konteks percakapannya.', 'source_ids': ids})
        elif stage == 'intent':
            uncertain(data.get('intent'), stage, 'Penilaian tingkat niat', data.get('source_ids', []))
        elif stage == 'result':
            action = result.get('action') or {}
            uncertain(action, stage, 'Rekomendasi ' + ACTION_NAMES.get(action.get('choice'), 'tindak lanjut'), result.get('evidence_ids', []))
            # Intent may also trigger the final stage's review; avoid duplicate explanations.
            if not any(reason['stage'] == 'intent' for reason in reasons):
                uncertain(result.get('intent'), stage, 'Penilaian tingkat niat', result.get('evidence_ids', []))
            if result.get('has_opportunity') and result.get('calculation', {}).get('additional_outlets') is None:
                reasons.append({'code': 'unconfirmed_outlets', 'stage': stage, 'title': 'Jumlah outlet tambahan belum pasti',
                                'message': 'Jumlah outlet tambahan belum dapat dipastikan dari bukti. Konfirmasi angka dan rencana yang berlaku sebelum memakai estimasi nilai.', 'source_ids': result.get('evidence_ids', [])})
                for call in run.get('calls', []):
                    answer = call.get('response', {}).get('answers', {}).get('outlet_candidate')
                    if answer:
                        uncertain(answer, stage, 'Pemilihan angka outlet', call.get('source_ids', []))
        if len(reasons) == before and not (stage == 'result' and any(r['stage'] == 'intent' for r in reasons)):
            reasons.append({'code': 'limited_history', 'stage': stage, 'title': 'Detail peninjauan terbatas',
                            'message': 'Tahap ini ditandai perlu ditinjau, tetapi bukti tersimpan belum cukup untuk menjelaskan pemicunya secara rinci. Periksa log evaluasi asli.', 'source_ids': []})

    next_steps = []
    if result:
        action = (result.get('action') or {}).get('choice', 'insufficient')
        confirmations, outcome = {
            'discovery': (['Konfirmasi jumlah outlet tambahan dan jadwal pembukaan.', 'Konfirmasi kebutuhan fitur dan ruang lingkup paket.'], 'Kebutuhan yang cukup jelas untuk menyusun penawaran.'),
            'proposal': (['Konfirmasi jumlah outlet, jadwal, kebutuhan fitur, dan harga kontrak.', 'Periksa paket serta approval diskon sebelum mengirim penawaran.'], 'Draft penawaran berbasis kebutuhan dan ketentuan yang sudah dikonfirmasi.'),
            'resolve': (['Verifikasi masalah yang secara eksplisit disyaratkan sebelum ekspansi.', 'Sepakati penanganan dengan tim terkait; jadwal penyelesaian perlu dikonfirmasi.'], 'Syarat ekspansi terverifikasi dan rencana penanganan disepakati.'),
            'stakeholder': (['Konfirmasi pihak yang berwenang menyetujui kebutuhan, anggaran, dan pembelian.'], 'Stakeholder dan jalur persetujuan terkonfirmasi.'),
            'insufficient': (['Periksa bukti sumber dan konfirmasi apakah ada rencana ekspansi pelanggan.', 'Lengkapi jumlah outlet, jadwal, kebutuhan, dan pihak yang dapat mengonfirmasi.'], 'Informasi yang cukup untuk menentukan langkah berikutnya.'),
        }.get(action, (['Periksa bukti dan konfirmasi kebutuhan pelanggan.'], 'Informasi tindak lanjut terkonfirmasi.'))
        calc = result.get('calculation') or {}
        if calc.get('additional_outlets') and action in ('discovery', 'proposal'):
            confirmations[0] = f"Konfirmasi rencana tambahan {calc['additional_outlets']} outlet dan jadwal pembukaannya."
        if calc.get('exceeds_package'):
            confirmations.append(f"Konfirmasi paket untuk target {calc['target_outlets']} outlet; target melampaui batas paket existing. Harga upgrade belum tersedia.")
        next_steps = [{'action': result.get('action_label') or 'Lengkapi informasi', 'owner': (result.get('owner') or {}).get('nama') or 'Owner belum ditentukan',
                       'confirmations': confirmations, 'expected_outcome': outcome}]
    run['review_reasons'], run['next_steps'] = reasons, next_steps
    if result:
        result['review_reasons'], result['next_steps'] = reasons, next_steps
    return run
