"""Versioned MVP rubric. These definitions also drive the dashboard and exports."""
VERSION = 'expansion-v2.0'
INTENT_LEVELS = ['Belum ada niat eksplisit', 'Eksplorasi', 'Rencana konkret', 'Permintaan penawaran']
STEPS = [
    ('context', 'Kumpulkan konteks', 'DATA', 'Hubungkan record akun, thread, kontrak, usage, tiket, dan kandidat pipeline.'),
    ('opportunity', 'Identifikasi peluang', 'NOUL + CHOICE + SCORE', 'OI-1–OI-4: sinyal, jenis, niat, dan rincian ekspansi.'),
    ('financial', 'Estimasi nilai', 'KODE + NOUL + CHOICE', 'FE-1–FE-3: kecukupan input dan estimasi rupiah yang dihitung kode.'),
    ('readiness', 'Hambatan dan kesiapan', 'NOUL + CHOICE + SCORE', 'BR-1–BR-4: potensi risiko, kesiapan, dan kebutuhan konfirmasi.'),
    ('pipeline', 'Keterkaitan pipeline', 'NOUL + CHOICE', 'PC-1–PC-3: evaluasi jalur yang benar-benar didukung record sumber.'),
    ('evidence', 'Jalur bukti', 'NOUL + CHOICE + SCORE', 'EP-1–EP-5: periksa draf rekomendasi dan keterlacakan buktinya.'),
    ('result', 'Hasil', 'KODE', 'Kesimpulan, alasan review, nilai, serta tindak lanjut berbasis bukti.'),
]


def item(key, group, text, kind, criteria=None):
    return {'id': key, 'group': group, 'text': text, 'type': kind,
            'criteria': criteria or {'true': 'Didukung bukti sumber yang diberikan.', 'false': 'Tidak didukung bukti sumber yang diberikan.'}}


QUESTIONS = [
    item('OI-1', 'opportunity', 'Apakah data menunjukkan sinyal ekspansi dari pelanggan yang sudah ada?', 'noul'),
    item('OI-2', 'opportunity', 'Apa jenis sinyal ekspansi yang teridentifikasi?', 'choice', {
        'outlets': 'Tambahan outlet', 'upgrade': 'Upgrade paket', 'feature': 'Kebutuhan modul/fitur',
        'other': 'Ekspansi lain', 'none': 'Tidak ditemukan', 'unclear': 'Tidak jelas'}),
    item('OI-3', 'opportunity', 'Seberapa kuat bukti niat ekspansi dalam informasi yang tersedia?', 'score', INTENT_LEVELS),
    item('OI-4', 'opportunity', 'Apakah sinyal ekspansi didukung oleh informasi spesifik seperti jumlah outlet, lokasi, atau target waktu?', 'noul'),
    item('EP-1', 'evidence', 'Apakah setiap rekomendasi memiliki bukti sumber yang dapat ditelusuri?', 'noul'),
    item('EP-2', 'evidence', 'Sumber data apa yang paling relevan untuk memvalidasi peluang ini?', 'choice', {
        'crm': 'CRM', 'interactions': 'Interaksi', 'usage': 'Usage', 'support': 'Support',
        'contracts': 'Kontrak/billing', 'decisions': 'Keputusan', 'insufficient': 'Informasi belum cukup'}),
    item('EP-3', 'evidence', 'Seberapa kuat bukti yang tersedia dalam mendukung rekomendasi?', 'score', [
        'Tanpa bukti', 'Bukti tidak langsung', 'Bukti langsung dari satu sumber', 'Bukti langsung dari beberapa sumber terkait']),
    item('EP-4', 'evidence', 'Apakah hubungan antar-entitas yang digunakan dalam rekomendasi didukung oleh relasi atau record sumber yang valid?', 'noul'),
    item('EP-5', 'evidence', 'Apakah rekomendasi didukung oleh bukti relevan dari lebih dari satu sumber yang saling berkaitan?', 'noul'),
    item('FE-1', 'financial', 'Apakah data yang tersedia cukup untuk menghitung estimasi nilai ekspansi?', 'noul'),
    item('FE-2', 'financial', 'Faktor utama apa yang paling memengaruhi estimasi nilai ekspansi?', 'choice', {
        'outlets': 'Jumlah outlet', 'price': 'Harga', 'period': 'Periode aktif', 'discount': 'Diskon', 'insufficient': 'Informasi belum cukup'}),
    item('FE-3', 'financial', 'Apakah estimasi nilai didukung oleh data outlet, harga, dan periode yang dapat diverifikasi?', 'noul'),
    item('BR-1', 'readiness', 'Apakah terdapat masalah yang berpotensi menghambat realisasi ekspansi?', 'noul'),
    item('BR-2', 'readiness', 'Apa jenis hambatan utama yang teridentifikasi?', 'choice', {
        'product': 'Produk/teknis', 'commercial': 'Komersial/kontrak', 'operational': 'Operasional',
        'stakeholder': 'Stakeholder', 'none': 'Tidak ditemukan', 'unclear': 'Tidak jelas'}),
    item('BR-3', 'readiness', 'Seberapa siap peluang ini untuk ditindaklanjuti berdasarkan bukti yang tersedia?', 'score', [
        'Informasi belum cukup', 'Perlu konfirmasi', 'Siap discovery', 'Siap menyusun penawaran']),
    item('BR-4', 'readiness', 'Apakah informasi penting masih perlu dikonfirmasi sebelum tindak lanjut dilakukan?', 'noul'),
    item('PC-1', 'pipeline', 'Apakah terdapat relasi yang relevan antara akun pelanggan dan data sales pipeline?', 'noul'),
    item('PC-2', 'pipeline', 'Apa jenis relasi bisnis yang ditemukan antara akun dan peluang pipeline?', 'choice', {
        'direct': 'Deal langsung', 'contact': 'Kontak lintas organisasi', 'interaction': 'Interaksi bisnis eksplisit',
        'precedent': 'Preseden pembanding', 'none': 'Tidak ditemukan', 'unclear': 'Tidak jelas'}),
    item('PC-3', 'pipeline', 'Apakah relasi tersebut memberikan dasar yang cukup untuk merekomendasikan tindak lanjut bisnis?', 'noul'),
]
BY_ID = {q['id']: q for q in QUESTIONS}


def definition():
    return {'version': VERSION,
            'steps': [{'id': k, 'title': t, 'primitive': p, 'description': d} for k, t, p, d in STEPS],
            'questions': QUESTIONS}


def pending():
    return {q['id']: {**q, 'status': 'waiting', 'answer': None, 'source_ids': [], 'checks': [], 'applicable': True} for q in QUESTIONS}


def interpretation(question, answer):
    """Noul is support, not an extra model confidence field."""
    if question['type'] == 'noul':
        value = answer['noul']
        return 'Mendukung' if value >= .6 else 'Tidak mendukung' if value <= .4 else 'Perlu ditinjau'
    if question['type'] == 'choice':
        return question['criteria'][answer['choice']]
    top = max(answer['probabilities'], key=answer['probabilities'].get)
    return question['criteria'][int(top)]


def review_reasons(question, answer, source_ids):
    base = {'stage': question['group'], 'question_id': question['id'], 'title': f"{question['id']} · {question['text']}", 'source_ids': source_ids}
    reasons = []
    if question['type'] == 'noul':
        if .4 < answer['noul'] < .6:
            reasons.append({**base, 'code': 'ambiguous_support', 'message': f"{question['id']}: dukungan bukti {answer['noul']:.0%} berada di antara 40% dan 60%. Periksa sumber terkait. Ini bukan nilai confidence tambahan."})
    else:
        if answer['confidence'] < .6:
            reasons.append({**base, 'code': 'low_confidence', 'confidence': answer['confidence'], 'threshold': .6,
                            'message': f"{question['id']}: confidence penilaian {answer['confidence']:.0%}, di bawah batas aplikasi 60%. Periksa sumber terkait."})
        probs = answer['probabilities']
        high = max(probs.values())
        if sum(abs(v - high) < 1e-8 for v in probs.values()) > 1:
            reasons.append({**base, 'code': 'tied_choices', 'message': f"{question['id']}: probabilitas tertinggi seri; belum ada satu pilihan yang paling kuat."})
        if answer.get('choice') == 'unclear':
            reasons.append({**base, 'code': 'unclear_classification', 'message': f"{question['id']}: kategori belum jelas dari bukti tersedia."})
    return reasons
