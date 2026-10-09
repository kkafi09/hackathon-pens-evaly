import { number, t, tx, useLanguage } from './i18n';
import type { Evidence } from './types';

const labels = {
  context: 'Konteks yang diperiksa',
  expansion: 'Bukti ekspansi / thread terkait',
  calculation: 'Dasar perhitungan',
};

export default function EvidenceView({
  items,
  supporting,
  onEvidence,
  onFocus,
}: {
  items: Evidence[];
  supporting: boolean;
  onEvidence: (id: string) => void;
  onFocus: () => void;
}) {
  useLanguage();
  return (
    <section className="provenance-panel" aria-label={t('Sumber analisis')}>
      <div className="provenance-heading">
        <strong>{supporting ? t('Bukti pendukung hasil') : t('Data yang dievaluasi')}</strong>
        <button onClick={onFocus} disabled={!items.length}>
          {t('Fokus bukti') + ' '}
        </button>
      </div>
      <p>{t('Peran sumber ditentukan workflow. Jev tidak mengembalikan alasan internal model.')}</p>
      <div className="proof-legend">
        <span className="proof-expansion">{t('Ekspansi')}</span>
        <span className="proof-calculation">{t('Perhitungan')}</span>
        <span className="proof-context">{t('Konteks / konfirmasi')}</span>
      </div>
      {!items.length && <p>{t('Belum ada bukti pendukung yang tersedia.')}</p>}
      <div className="proof-list">
        {items.map((item) => {
          const text = String(item.record.isi || item.record.deskripsi || '');
          const offset = item.quote ? text.indexOf(item.quote) : -1;
          return (
            <details className={`proof-card proof-${item.role}`} key={item.id}>
              <summary>
                {item.id} · {tx(labels[item.role])}
              </summary>
              <button
                aria-label={t('Buka bukti {0}', [item.id])}
                onClick={() => onEvidence(item.id)}
              >
                {item.label}
              </button>
              <small>
                {item.source} ·{' '}
                {item.node_id
                  ? t('Record sumber')
                  : t('Snapshot · tidak tersedia sebagai node graph')}
              </small>
              {Object.entries(item.assessments || {}).map(([key, answer]) => (
                <p key={key}>
                  {t('Hasil') + ' '}
                  {key}:{' '}
                  {answer.type === 'noul'
                    ? `Noul ${number(answer.noul, 3)}`
                    : answer.type === 'score'
                      ? `Score ${number(answer.score, 2)}`
                      : `Choice ${answer.choice}`}
                </p>
              ))}
              {item.source === 'support_tickets.csv' && (
                <p>
                  {t(
                    'Diperiksa sebagai kemungkinan syarat ekspansi; bukan label penghambat otomatis.',
                  ) + ' '}
                </p>
              )}
              {text && (
                <p>
                  {offset >= 0 ? (
                    <>
                      {text.slice(0, offset)}
                      <mark>{item.quote}</mark>
                      {text.slice(offset + item.quote!.length)}
                    </>
                  ) : (
                    text
                  )}
                </p>
              )}
              {item.fields
                ?.filter((field) => field !== 'isi')
                .map((field) => (
                  <p key={field}>
                    <strong>{field.replaceAll('_', ' ')}:</strong>{' '}
                    <mark>{String(item.record[field])}</mark>
                  </p>
                ))}
              {!text && !item.fields?.length && <pre>{JSON.stringify(item.record, null, 2)}</pre>}
              {item.question_refs.length > 0 && (
                <small>
                  {t('Pertanyaan terkait input:') + ' '}
                  {Array.from(new Set(item.question_refs)).join(', ')}
                </small>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
