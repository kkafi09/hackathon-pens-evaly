"""Readable snapshot-only reports; no model or current-source lookup."""
from io import BytesIO
from .localization import project, text
from copy import deepcopy
from pathlib import Path
from xml.sax.saxutils import escape
from datetime import datetime
from zoneinfo import ZoneInfo
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle, PageBreak, CondPageBreak

FONT = 'EvalySans'
pdfmetrics.registerFont(TTFont(FONT, str(Path(__file__).parent / 'fonts' / 'DejaVuSans.ttf')))
STATUS = {'done': 'Selesai', 'review': 'Perlu ditinjau', 'failed': 'Gagal'}


def rupiah(value, lang='id'):
    return text('Belum dihitung', lang) if value is None else ('Rp' + f'{value:,.0f}'.replace(',', '.') if lang == 'id' else 'IDR ' + f'{value:,.0f}')


def time_label(value, lang='id'):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(ZoneInfo('Asia/Bangkok')).strftime('%d-%m-%Y %H:%M' if lang == 'id' else '%b %d, %Y %H:%M') + (' WIB' if lang == 'id' else ' UTC+07:00')
    except (ValueError, TypeError):
        return str(value or '-')


def render(runs, lang='id'):
    from .explanations import explain_run
    from .localization import score_label
    tr = lambda value: text(value, lang)
    runs = [project(explain_run(deepcopy(run)), lang) for run in runs]
    stream = BytesIO()
    doc = SimpleDocTemplate(stream, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=45, bottomMargin=45, title=tr('Evaly - Laporan Analisis'), author='Evaly')
    styles = getSampleStyleSheet()
    for name in ('Normal', 'BodyText', 'Title', 'Heading1', 'Heading2', 'Heading3'):
        styles[name].fontName = FONT
    for name in ('Heading1', 'Heading3'):
        styles[name].keepWithNext = True
    styles['Heading2'].keepWithNext = False
    styles['BodyText'].fontSize, styles['BodyText'].leading = (9, 14)
    styles.add(ParagraphStyle('CellEvaly', fontName=FONT, fontSize=8, leading=12, spaceAfter=2, wordWrap='CJK'))
    story = []

    def para(value, style='BodyText', raw=False):
        return Paragraph(escape(str((value if raw else text(value, lang)) if value is not None else '-')).replace('\n', '<br/>'), styles[style])

    def conclusion(run):
        result = run.get('result') or {}
        title = (result.get('validation_summary') or {}).get('title', result.get('title')) or tr('Analisis gagal')
        return title + ('\n' + score_label(result['expansion_score'], lang=lang) if result.get('expansion_score') else '')

    def heading(text, room=130):
        story.extend([CondPageBreak(room), Spacer(1, 12), para(text, 'Heading2')])

    def table(headers, rows, widths):
        data = [[para(cell, 'CellEvaly') for cell in headers]] + [[para(cell, 'CellEvaly') for cell in row] for row in rows]
        grid = LongTable(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
        grid.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8f1ff')), ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#195ab5')), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#d5e1f1')), ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7), ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7)]))
        story.append(grid)
    ordered = sorted(runs, key=lambda r: (r['created_at'], r['id']), reverse=True)
    if len(ordered) > 1:
        story.extend([para('Evaly', 'Title'), para(tr('Ringkasan laporan analisis'), 'Heading1'), para(tr('Setiap baris adalah satu evaluasi tersimpan. Nilai antar-run tidak dijumlahkan karena akun yang sama dapat dievaluasi berulang.'))])
        table([tr('Akun / evaluasi'), tr('Status'), tr('Kesimpulan'), tr('Neto annualized')], [[f"{r['account_id']} - {r.get('account_name') or '-'}\n{time_label(r['created_at'], lang=lang)}", tr(STATUS.get(r['status'], r['status'])), conclusion(r), rupiah(((r.get('result') or {}).get('calculation') or {}).get('net_annual_scenario'), lang=lang) + '\n' + ((r.get('result') or {}).get('validation_summary') or {}).get('estimate_label', '')] for r in ordered], [145, 75, 180, 115])
        story.append(PageBreak())
    for index, run in enumerate(ordered):
        if index:
            story.append(PageBreak())
        result = run.get('result') or {}
        summary = result.get('validation_summary') or {}
        score = result.get('expansion_score')
        story.extend([para('Evaly - Account Expansion', 'Title'), para(f"{run['account_id']} - {run.get('account_name') or run['account_id']}", 'Heading1'), para(f"{tr('Evaluasi:')} {time_label(run['created_at'], lang=lang)} | Status: {tr(STATUS.get(run['status'], run['status']))}"), para(f"Run: {run['id']} | Rubrik: {run.get('rubric_version', '-')}"), para(f"Snapshot: {run.get('snapshot', '-')} | Gateway: {run.get('gateway', 'typesafe')} | Model: {run.get('model') or '-'}"), para(f"{tr('Hash dataset:')} {run.get('dataset_hash', '-')}"), para(tr('Confidence adalah kepastian penilaian model, bukan probabilitas transaksi berhasil.'))])
        heading(tr('Kesimpulan'))
        if not result:
            story.append(para(run.get('error') or tr('Tidak tersedia hasil akhir pada evaluasi ini.')))
        else:
            story.extend([para(summary.get('title', result.get('title', '-'))), para(f"Tindakan: {summary.get('action_label', result.get('action_label')) or tr('Belum ditentukan')}")])
            if summary:
                story.extend([para(summary['summary']), para(f"Jenis sinyal: {summary['signal_type']} | Aturan kesimpulan: {summary['version']}"), para(f"{summary['supporting_record_count']} record pendukung | {summary['source_count']} sumber data berbeda | {summary['evaluated_record_count']} record dievaluasi")])
                story.extend((para(note) for note in summary['limitations']))
        if score:
            heading(tr('Skor dukungan ekspansi'))
            story.extend([para(score_label(score, lang=lang)), para(score['note']), para(f"Aturan: {score['version']} | Bobot kelompok aktif: {score['active_group_weight']}% | Jawaban valid: {score['evaluated_count']}/{score['applicable_count']}"), para(f"Skor dasar: {score['base_score']} | Batas bukti: {score['cap_score']} | Pembatas: {', '.join(score['limiting_parameter_ids']) or tr('Tidak ada')}")])
            heading(tr('Bagaimana skor dihitung'))
            story.append(para(tr('Skor dasar = rata-rata kelompok berbobot. Skor akhir dibatasi dukungan OI-1, EP-1, dan EP-4. Bobot dibagi rata antarparameter yang berlaku dalam kelompok.')))
            table([tr('Kelompok'), tr('Bobot / efektif'), tr('Kontribusi')], [[g['label'], f"{g['policy_weight']}% / {g['effective_weight']:.4f}", g['value'] if g['applicable'] else tr('Tidak berlaku')] for g in score['groups']], [220, 140, 155])
            table([tr('Parameter'), tr('Kontribusi mentah'), tr('Pembatas / sumber')], [[p['id'], p['raw_value'] if p['applicable'] else tr('Tidak berlaku'), '\n'.join(p['adjustments']) + '\n' + tr('Sumber:') + ' ' + '; '.join(p['source_ids'])] for p in score['parameters']], [65, 140, 310])
        heading(tr('Yang perlu ditinjau'))
        reasons = run.get('review_reasons', [])
        for reason in reasons:
            story.append(para('- ' + reason['message']))
        if not reasons:
            story.append(para(tr('Tidak ada pemicu review tersimpan.') if result else tr('Belum ada penilaian akhir.')))
        heading(tr('Usulan setelah verifikasi') if summary.get('status') == 'review' else tr('Langkah berikutnya'))
        for step in run.get('next_steps', []):
            story.extend([para(f"{step['action']} | Owner: {step['owner']}"), para(tr('Konfirmasi:') + ' ' + '; '.join(step['confirmations'])), para(tr('Hasil yang diharapkan:') + ' ' + step['expected_outcome'])])
            for item in step.get('verification', []):
                story.append(para(f"{item.get('parameter_id') or 'Pemeriksaan'}: {item['message']} | Sumber: {'; '.join(item['source_ids'])}"))
        if not run.get('next_steps'):
            story.append(para(tr('Belum ada tindak lanjut tersimpan.')))
        if result:
            calc = result.get('calculation') or {}
            heading(tr('Estimasi nilai'))
            if summary:
                story.append(para(summary['estimate_label']))
            table([tr('Komponen'), tr('Nilai')], [[label, value] for label, value in [(tr('Outlet existing'), calc.get('existing_outlets', calc.get('current_outlets'))), (tr('Tambahan outlet'), calc.get('additional_outlets')), (tr('Target outlet'), calc.get('target_outlets')), (tr('Tambahan bruto / tahun'), rupiah(calc.get('gross_annual'), lang=lang)), (tr('Tambahan neto skenario / tahun'), rupiah(calc.get('net_annual_scenario'), lang=lang)), ('Formula', calc.get('formula'))]], [210, 305])
            for note in calc.get('assumptions', []) + result.get('concerns', []):
                story.append(para('- ' + note))
        heading(tr('Evaluasi rubrik'))
        rubric = run.get('rubric') or {}
        if rubric:
            source_sets = {}
            for q in rubric.values():
                ids = tuple(q.get('source_ids', []))
                if ids not in source_sets:
                    source_sets[ids] = f'S{len(source_sets) + 1:02d}'
            table([tr('ID / Tipe'), tr('Pertanyaan / jawaban'), tr('Sumber / pemeriksaan')], [[f"{key}\n{q['type'].title()}", f"{q['text']}\n{q.get('label') or tr('Belum dinilai')}\n{tr('Status')}: {tr(STATUS.get(q['status'], q['status']))}\n{q.get('note') or ''}", f"{source_sets[tuple(q.get('source_ids', []))]}: {len(q.get('source_ids', []))} {tr('record (daftar lengkap di bawah)')}\n" + '\n'.join((f"{c['id']}: {(tr('terpenuhi') if c['passed'] else tr('belum terpenuhi') if c['passed'] is False else tr('belum diperiksa'))}" for c in q.get('checks', [])))] for key, q in rubric.items()], [65, 255, 195])
            heading(tr('Sumber input yang dievaluasi'))
            story.append(para(tr('Daftar ini adalah input yang diperiksa, bukan otomatis bukti pendukung. Jawaban negatif atau pemeriksaan tidak terpenuhi tidak otomatis berarti status perlu ditinjau.')))
            source_rows = []
            for ids, reference in source_sets.items():
                for offset in range(0, max(1, len(ids)), 8):
                    source_rows.append([reference + (' ' + tr('(lanj.)') if offset else ''), '; '.join(ids[offset:offset + 8]) or tr('Tidak ada record')])
            table([tr('Referensi'), tr('ID record sumber')], source_rows, [65, 450])
        else:
            story.append(para(tr('Rincian rubrik tidak tersimpan pada versi hasil ini. Tidak ditambahkan jawaban baru.')))
        heading(tr('Bukti pendukung dari snapshot evaluasi'))
        evidence = result.get('provenance', [])
        for item in evidence:
            record = item.get('record') or {}
            story.append(para(f"{item['id']} | {item['source']} | {item.get('role', 'context')}", 'Heading3'))
            if item.get('quote'):
                story.append(para(text('Kutipan:', lang) + ' ' + item['quote'], raw=True))
            for field, value in record.items():
                if value not in ('', None) and (not isinstance(value, (list, dict))):
                    story.append(para(f'{field}: {value}', raw=True))
        if not evidence:
            for item in result.get('source_evidence', []):
                story.append(para(f"{item.get('interaction_id', '-')} | interactions.jsonl | {item.get('isi', '')}", raw=True))
            if not result.get('source_evidence'):
                story.append(para(tr('Snapshot bukti pendukung belum tersedia pada hasil ini.')))
        if result.get('evidence_paths'):
            heading(tr('Jalur bukti dari relasi tersimpan'), room=220)
            table([tr('Dari'), tr('Relasi'), tr('Ke')], [[e['source'], e['label'].replace('_', ' '), e['target']] for e in result['evidence_paths']], [145, 225, 145])

    def footer(canvas, document):
        canvas.setFont(FONT, 8)
        canvas.setFillColor(colors.HexColor('#526780'))
        canvas.drawString(40, 25, tr('Evaly | Hasil evaluasi tersimpan'))
        canvas.drawRightString(A4[0] - 40, 25, f"{tr('Halaman')} {document.page}")
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return stream.getvalue()
