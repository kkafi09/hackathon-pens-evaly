import { statusLabels, type RubricEvaluation } from './types';

export default function RubricView({
  items,
  onQuestion,
  onEvidence,
}: {
  items: RubricEvaluation[];
  onQuestion: (item: RubricEvaluation) => void;
  onEvidence: (id: string) => void;
}) {
  return (
    <div className="rubric-list">
      {items.map((item) => (
        <article className="rubric-question" key={item.id} data-testid={`rubric-${item.id}`}>
          <div className="rubric-title">
            <strong>{item.id}</strong>
            <span className="primitive">{item.type.toUpperCase()}</span>
            <span className={`status ${item.status}`}>{statusLabels[item.status]}</span>
          </div>
          <h4>{item.text}</h4>
          <p className="rubric-answer">
            {item.applicable === false
              ? 'Tidak diterapkan pada hasil ini'
              : item.label || 'Belum dievaluasi'}
          </p>
          {item.note && <p className="detail-note">{item.note}</p>}
          {item.answer && item.applicable !== false && (
            <p className="detail-note">
              {item.type === 'noul' ? (
                <>
                  Dukungan bukti {Math.round(item.answer.noul * 100)}% · batas aplikasi: ≤40% tidak
                  mendukung, ≥60% mendukung. Bukan confidence tambahan.
                </>
              ) : (
                <>
                  Confidence penilaian {Math.round(item.answer.confidence * 100)}% · bukan
                  probabilitas transaksi berhasil.
                </>
              )}
            </p>
          )}
          {!!item.source_ids.length && (
            <>
              <button
                className="evidence-link"
                onClick={() => onQuestion(item)}
                aria-label={`Sorot data ${item.id}`}
              >
                Sorot data yang dievaluasi · {item.source_ids.length} record
              </button>
              <details>
                <summary>Record sumber {item.id}</summary>
                <div className="evidence-chips">
                  {item.source_ids.map((id) => (
                    <button className="evidence-link" key={id} onClick={() => onEvidence(id)}>
                      {id}
                    </button>
                  ))}
                </div>
              </details>
            </>
          )}
          {!!item.checks.length && (
            <details>
              <summary>Pemeriksaan kode {item.id}</summary>
              {item.checks.map((check) => (
                <p key={check.id}>
                  <strong>
                    {check.passed === true
                      ? 'Terpenuhi'
                      : check.passed === false
                        ? 'Belum terpenuhi'
                        : 'Belum diperiksa'}
                    :
                  </strong>{' '}
                  {check.message}
                </p>
              ))}
            </details>
          )}
          {item.answer && (
            <details>
              <summary>Detail penilaian {item.id}</summary>
              {item.answer.probabilities && (
                <div className="distribution">
                  {Object.entries(item.answer.probabilities as Record<string, number>).map(
                    ([key, value]) => (
                      <div className="probability" key={key}>
                        <span>
                          {(Array.isArray(item.criteria)
                            ? item.criteria[Number(key)]
                            : item.criteria[key]) || key}
                        </span>
                        <div>
                          <i style={{ width: `${value * 100}%` }} />
                        </div>
                        <small>{Math.round(value * 100)}%</small>
                      </div>
                    ),
                  )}
                </div>
              )}
              <pre>{JSON.stringify(item.answer, null, 2)}</pre>
            </details>
          )}
        </article>
      ))}
    </div>
  );
}
