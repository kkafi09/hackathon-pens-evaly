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
  return (
    <section className="provenance-panel" aria-label="Sumber analisis">
      <div className="provenance-heading">
        <strong>{supporting ? 'Bukti pendukung hasil' : 'Data yang dievaluasi'}</strong>
        <button onClick={onFocus} disabled={!items.length}>
          Fokus bukti
        </button>
      </div>
      <p>Peran sumber ditentukan workflow. Jev tidak mengembalikan alasan internal model.</p>
      <div className="proof-legend">
        <span className="proof-expansion">Ekspansi</span>
        <span className="proof-calculation">Perhitungan</span>
        <span className="proof-context">Konteks / konfirmasi</span>
      </div>
      {!items.length && <p>Belum ada bukti pendukung yang tersedia.</p>}
      <div className="proof-list">
        {items.map((item) => {
          const text = String(item.record.isi || item.record.deskripsi || '');
          const offset = item.quote ? text.indexOf(item.quote) : -1;
          return (
            <details className={`proof-card proof-${item.role}`} key={item.id}>
              <summary>
                {item.id} · {labels[item.role]}
              </summary>
              <button aria-label={`Buka bukti ${item.id}`} onClick={() => onEvidence(item.id)}>
                {item.label}
              </button>
              <small>
                {item.source} ·{' '}
                {item.node_id ? 'Record sumber' : 'Snapshot · tidak tersedia sebagai node graph'}
              </small>
              {Object.entries(item.assessments || {}).map(([key, answer]) => (
                <p key={key}>
                  Hasil {key}:{' '}
                  {answer.type === 'noul'
                    ? `Noul ${answer.noul.toFixed(3)}`
                    : answer.type === 'score'
                      ? `Score ${answer.score.toFixed(2)}`
                      : `Choice ${answer.choice}`}
                </p>
              ))}
              {item.source === 'support_tickets.csv' && (
                <p>
                  Diperiksa sebagai kemungkinan syarat ekspansi; bukan label penghambat otomatis.
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
                  Pertanyaan terkait input: {Array.from(new Set(item.question_refs)).join(', ')}
                </small>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
