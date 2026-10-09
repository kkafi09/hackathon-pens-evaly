"""Readable snapshot-only reports; no model or current-source lookup."""
from io import BytesIO
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


def rupiah(value):
    return 'Belum dihitung' if value is None else 'Rp' + f'{value:,.0f}'.replace(',', '.')


def time_label(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(ZoneInfo('Asia/Bangkok')).strftime('%d-%m-%Y %H:%M') + ' WIB'
    except (ValueError, TypeError):
        return str(value or '-')


def render(runs):
    stream = BytesIO()
    doc = SimpleDocTemplate(stream, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=45, bottomMargin=45,
                            title='Evaly - Laporan Analisis', author='Evaly')
    styles = getSampleStyleSheet()
    for name in ('Normal', 'BodyText', 'Title', 'Heading1', 'Heading2', 'Heading3'):
        styles[name].fontName = FONT
    for name in ('Heading1', 'Heading3'):
        styles[name].keepWithNext = True
    styles['Heading2'].keepWithNext = False
    styles['BodyText'].fontSize, styles['BodyText'].leading = 9, 14
    styles.add(ParagraphStyle('CellEvaly', fontName=FONT, fontSize=8, leading=12, spaceAfter=2, wordWrap='CJK'))
    story = []

    def para(value, style='BodyText'):
        return Paragraph(escape(str(value if value is not None else '-')).replace('\n', '<br/>'), styles[style])

    def heading(text, room=130):
        story.extend([CondPageBreak(room), Spacer(1, 12), para(text, 'Heading2')])

    def table(headers, rows, widths):
        data = [[para(cell, 'CellEvaly') for cell in headers]] + [[para(cell, 'CellEvaly') for cell in row] for row in rows]
        grid = LongTable(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
        grid.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e8f1ff')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#195ab5')), ('VALIGN',(0,0),(-1,-1),'TOP'),
            ('GRID',(0,0),(-1,-1),.3,colors.HexColor('#d5e1f1')), ('LEFTPADDING',(0,0),(-1,-1),7),
            ('RIGHTPADDING',(0,0),(-1,-1),7), ('TOPPADDING',(0,0),(-1,-1),7), ('BOTTOMPADDING',(0,0),(-1,-1),7)]))
        story.append(grid)

    ordered = sorted(runs, key=lambda r: (r['created_at'], r['id']), reverse=True)
    if len(ordered) > 1:
        story.extend([para('Evaly', 'Title'), para('Ringkasan laporan analisis', 'Heading1'),
            para('Setiap baris adalah satu evaluasi tersimpan. Nilai antar-run tidak dijumlahkan karena akun yang sama dapat dievaluasi berulang.')])
        table(['Akun / evaluasi', 'Status', 'Kesimpulan', 'Neto annualized'], [
            [f"{r['account_id']} - {r.get('account_name') or '-'}\n{time_label(r['created_at'])}", STATUS.get(r['status'],r['status']),
             (r.get('result') or {}).get('title') or 'Analisis gagal', rupiah(((r.get('result') or {}).get('calculation') or {}).get('net_annual_scenario'))]
            for r in ordered], [145,75,180,115])
        story.append(PageBreak())
    for index, run in enumerate(ordered):
        if index:
            story.append(PageBreak())
        result = run.get('result') or {}
        story.extend([para('Evaly - Account Expansion', 'Title'),
            para(f"{run['account_id']} - {run.get('account_name') or run['account_id']}", 'Heading1'),
            para(f"Evaluasi: {time_label(run['created_at'])} | Status: {STATUS.get(run['status'], run['status'])}"),
            para(f"Run: {run['id']} | Rubrik: {run.get('rubric_version', '-')}"),
            para(f"Snapshot: {run.get('snapshot', '-')} | Gateway: {run.get('gateway', 'typesafe')} | Model: {run.get('model') or '-'}"),
            para(f"Hash dataset: {run.get('dataset_hash', '-')}"),
            para('Confidence adalah kepastian penilaian model, bukan probabilitas transaksi berhasil.')])
        heading('Kesimpulan')
        if not result:
            story.append(para(run.get('error') or 'Tidak tersedia hasil akhir pada evaluasi ini.'))
        else:
            story.extend([para(result.get('title', '-')), para(f"Tingkat niat: {result.get('intent_label') or 'Belum dinilai'}"),
                          para(f"Tindakan: {result.get('action_label') or 'Belum ditentukan'}")])
        heading('Yang perlu ditinjau')
        reasons = run.get('review_reasons', [])
        for reason in reasons:
            story.append(para('- ' + reason['message']))
        if not reasons:
            story.append(para('Tidak ada pemicu review tersimpan.' if result else 'Belum ada penilaian akhir.'))
        heading('Langkah berikutnya')
        for step in run.get('next_steps', []):
            story.extend([para(f"{step['action']} | Owner: {step['owner']}"),
                para('Konfirmasi: ' + '; '.join(step['confirmations'])), para('Hasil yang diharapkan: ' + step['expected_outcome'])])
        if not run.get('next_steps'):
            story.append(para('Belum ada tindak lanjut tersimpan.'))
        if result:
            calc = result.get('calculation') or {}
            heading('Estimasi nilai')
            table(['Komponen', 'Nilai'], [[label, value] for label,value in [
                ('Outlet existing', calc.get('existing_outlets', calc.get('current_outlets'))), ('Tambahan outlet', calc.get('additional_outlets')),
                ('Target outlet', calc.get('target_outlets')), ('Tambahan bruto / tahun', rupiah(calc.get('gross_annual'))),
                ('Tambahan neto skenario / tahun', rupiah(calc.get('net_annual_scenario'))), ('Formula', calc.get('formula'))]], [210,305])
            for note in calc.get('assumptions', []) + result.get('concerns', []):
                story.append(para('- ' + note))
        heading('Evaluasi rubrik')
        rubric = run.get('rubric') or {}
        if rubric:
            source_sets = {}
            for q in rubric.values():
                ids = tuple(q.get('source_ids', []))
                if ids not in source_sets:
                    source_sets[ids] = f'S{len(source_sets)+1:02d}'
            table(['ID / Tipe', 'Pertanyaan / jawaban', 'Sumber / pemeriksaan'], [[
                f"{key}\n{q['type'].title()}", f"{q['text']}\n{q.get('label') or 'Belum dinilai'}\nStatus: {q['status']}\n{q.get('note') or ''}",
                f"{source_sets[tuple(q.get('source_ids', []))]}: {len(q.get('source_ids', []))} record (daftar lengkap di bawah)\n" +
                '\n'.join(f"{c['id']}: {'terpenuhi' if c['passed'] else 'belum terpenuhi' if c['passed'] is False else 'belum diperiksa'}" for c in q.get('checks', []))]
                for key,q in rubric.items()], [65,255,195])
            heading('Sumber input yang dievaluasi')
            story.append(para('Daftar ini adalah input yang diperiksa, bukan otomatis bukti pendukung. Jawaban negatif atau pemeriksaan tidak terpenuhi tidak otomatis berarti status perlu ditinjau.'))
            source_rows = []
            for ids,reference in source_sets.items():
                for offset in range(0, max(1,len(ids)), 8):
                    source_rows.append([reference + (' (lanj.)' if offset else ''), '; '.join(ids[offset:offset+8]) or 'Tidak ada record'])
            table(['Referensi', 'ID record sumber'], source_rows, [65,450])
        else:
            story.append(para('Rincian rubrik tidak tersimpan pada versi hasil ini. Tidak ditambahkan jawaban baru.'))
        heading('Bukti pendukung dari snapshot evaluasi')
        evidence = result.get('provenance', [])
        for item in evidence:
            record = item.get('record') or {}
            story.append(para(f"{item['id']} | {item['source']} | {item.get('role', 'context')}", 'Heading3'))
            if item.get('quote'):
                story.append(para('Kutipan: ' + item['quote']))
            for field,value in record.items():
                if value not in ('', None) and not isinstance(value, (list,dict)):
                    story.append(para(f'{field}: {value}'))
        if not evidence:
            for item in result.get('source_evidence', []):
                story.append(para(f"{item.get('interaction_id', '-')} | interactions.jsonl | {item.get('isi', '')}"))
            if not result.get('source_evidence'):
                story.append(para('Snapshot bukti pendukung belum tersedia pada hasil ini.'))
        if result.get('evidence_paths'):
            heading('Jalur bukti dari relasi tersimpan', room=220)
            table(['Dari', 'Relasi', 'Ke'], [[e['source'],e['label'].replace('_',' '),e['target']] for e in result['evidence_paths']], [145,225,145])

    def footer(canvas, document):
        canvas.setFont(FONT, 8)
        canvas.setFillColor(colors.HexColor('#526780'))
        canvas.drawString(40, 25, 'Evaly | Hasil evaluasi tersimpan')
        canvas.drawRightString(A4[0]-40, 25, f'Halaman {document.page}')
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return stream.getvalue()
