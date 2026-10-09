import { t, presentText as tx, useLanguage, withLanguage } from './i18n';
import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, Trash2 } from 'lucide-react';
import DeleteRunDialog from './DeleteRunDialog';
import { ScoreHeadline } from './ExpansionScoreView';
import {
  api,
  dateTime,
  money,
  statusLabels,
  type History,
  type RunStatus,
  type ValidationSummary,
  type ExpansionScore,
} from './types';

export type ReportRow = History & {
  account_id: string;
  account_name: string;
  title: string | null;
  intent_label: string | null;
  validation_summary?: ValidationSummary | null;
  expansion_score?: ExpansionScore | null;
  net_annual_scenario: number | null;
  action_label: string | null;
};
export async function downloadPDF(ids: string[]) {
  const response = await fetch(
    ids.length === 1
      ? withLanguage(`/api/expansion-runs/${encodeURIComponent(ids[0])}/export/pdf`)
      : withLanguage('/api/expansion-runs/export/pdf'),
    ids.length === 1
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run_ids: ids }),
        },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'PDF tidak dapat diunduh.');
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = ids.length === 1 ? `evaly-${ids[0]}.pdf` : 'evaly-reports.pdf';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function ReportPage({
  onOpen,
  onDeleted,
}: {
  onOpen: (row: ReportRow) => void;
  onDeleted: (id: string) => void;
}) {
  useLanguage();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [target, setTarget] = useState<ReportRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api<{ items: ReportRow[]; total: number }>(
          `/expansion-runs?q=${encodeURIComponent(query)}${status ? `&status=${status}` : ''}&offset=${page * 25}&limit=25`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (page && page * 25 >= data.total) {
          setPage(Math.max(0, Math.ceil(data.total / 25) - 1));
          return;
        }
        setRows(data.items);
        setTotal(data.total);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, status, page, revision]);
  useEffect(() => {
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  const terminal = (status: RunStatus) => ['done', 'review', 'failed'].includes(status);
  async function download(ids: string[]) {
    setDownloading(true);
    setError('');
    try {
      await downloadPDF(ids);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }
  async function remove() {
    if (!target) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api(`/expansion-runs/${target.id}`, { method: 'DELETE' });
      setSelected((ids) => ids.filter((id) => id !== target.id));
      onDeleted(target.id);
      setTarget(null);
      refresh();
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  return (
    <section className="report-page" aria-label={t('Report analisis')}>
      <div className="report-heading">
        <div>
          <h1>{t('Report analisis')}</h1>
          <p>{t('Seluruh evaluasi tersimpan lintas akun.')}</p>
        </div>
        <button
          className="primary"
          disabled={!selected.length || downloading}
          onClick={() => download(selected)}
        >
          <Download size={16} />{' '}
          {downloading ? t('Menyiapkan PDF…') : t('Unduh PDF pilihan ({0}/50)', [selected.length])}
        </button>
      </div>
      <div className="report-filters">
        <input
          aria-label={t('Cari report akun')}
          maxLength={300}
          placeholder={t('Cari nama atau ID akun…')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label={t('Filter status report')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">{t('Semua status')}</option>
          {['waiting', 'running', 'done', 'review', 'failed'].map((s) => (
            <option value={s} key={s}>
              {statusLabels[s as RunStatus]}
            </option>
          ))}
        </select>
        <button onClick={refresh}>{t('Perbarui')}</button>
        <button disabled={!selected.length} onClick={() => setSelected([])}>
          {t('Kosongkan pilihan') + ' '}
        </button>
        <span>
          {total} {t('hasil ·') + ' '}
          {selected.length} {t('dipilih') + ' '}
        </span>
      </div>
      {error && (
        <p role="alert" className="report-error">
          {tx(error)}
        </p>
      )}
      <div className="report-table-wrap" aria-busy={loading}>
        <table className="report-table">
          <thead>
            <tr>
              <th>{t('Pilih')}</th>
              <th>{t('Waktu')}</th>
              <th>{t('Akun')}</th>
              <th>{t('Status')}</th>
              <th>{t('Kesimpulan')}</th>
              <th>{t('Jenis sinyal / validasi')}</th>
              <th>{t('Neto / tahun')}</th>
              <th>{t('Tindakan berikutnya')}</th>
              <th>{tx('Rubrik')}</th>
              <th>{t('Aksi')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={t('Pilih report {0}', [row.id])}
                    checked={selected.includes(row.id)}
                    disabled={
                      !terminal(row.status) || (!selected.includes(row.id) && selected.length >= 50)
                    }
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id),
                      )
                    }
                  />
                </td>
                <td>{dateTime(row.created_at)}</td>
                <td>
                  <strong>{row.account_id}</strong>
                  <br />
                  {row.account_name || t('Nama belum tersimpan')}
                </td>
                <td>
                  <span className={`status ${row.status}`}>{statusLabels[row.status]}</span>
                </td>
                <td>
                  {tx(row.title) ||
                    (row.status === 'failed' ? t('Analisis gagal') : t('Belum ada hasil akhir'))}
                  {row.validation_summary && <p>{tx(row.validation_summary.summary)}</p>}
                  <ScoreHeadline score={row.expansion_score} />
                </td>
                <td>
                  {row.validation_summary ? (
                    <>
                      {tx(row.validation_summary.signal_type)}
                      <br />
                      {row.validation_summary.supporting_record_count} {t('record pendukung ·')}{' '}
                      {row.validation_summary.source_count} {t('sumber ·')}{' '}
                      {row.validation_summary.evaluated_record_count} {t('record dievaluasi') + ' '}
                      {row.validation_summary.limitations.map((note) => (
                        <p key={tx(note)}>{tx(note)}</p>
                      ))}
                    </>
                  ) : row.rubric_version === 'expansion-v2.0' ? (
                    row.status === 'done' || row.status === 'review' ? (
                      t('Validasi tersimpan belum lengkap')
                    ) : (
                      t('Belum ada hasil akhir')
                    )
                  ) : (
                    tx(row.intent_label) || t('Belum dinilai')
                  )}
                </td>
                <td>
                  {money(row.net_annual_scenario)}
                  {row.validation_summary && (
                    <small>{tx(row.validation_summary.estimate_label)}</small>
                  )}
                </td>
                <td>{tx(row.action_label) || t('Belum ditentukan')}</td>
                <td>{row.rubric_version}</td>
                <td>
                  <div className="report-row-actions">
                    <button aria-label={t('Buka report {0}', [row.id])} onClick={() => onOpen(row)}>
                      <ExternalLink size={15} />
                    </button>
                    <button
                      aria-label={t('Unduh PDF {0}', [row.id])}
                      disabled={!terminal(row.status) || downloading}
                      onClick={() => download([row.id])}
                    >
                      <Download size={15} />
                    </button>
                    <button
                      aria-label={t('Hapus report {0}', [row.id])}
                      disabled={!terminal(row.status)}
                      onClick={() => {
                        setTarget(row);
                        setDeleteError('');
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={10}>
                  {loading
                    ? t('Memuat report…')
                    : error
                      ? t('Report belum dapat dimuat.')
                      : t('Belum ada report yang sesuai.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="report-pagination">
        <button disabled={!page} onClick={() => setPage((v) => v - 1)}>
          {t('Sebelumnya') + ' '}
        </button>
        <span>
          {t('Halaman') + ' '}
          {page + 1} {t('dari') + ' '}
          {Math.max(1, Math.ceil(total / 25))}
        </span>
        <button disabled={(page + 1) * 25 >= total} onClick={() => setPage((v) => v + 1)}>
          {t('Berikutnya') + ' '}
        </button>
      </div>
      <DeleteRunDialog
        target={target}
        account={target ? t('{0} · {1}', [target.account_id, target.account_name || '']) : ''}
        busy={deleting}
        error={tx(deleteError)}
        onCancel={() => {
          if (!deleting) setTarget(null);
        }}
        onConfirm={remove}
      />
    </section>
  );
}
