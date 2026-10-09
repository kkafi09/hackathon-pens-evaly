import { t, presentText as tx, useLanguage } from './i18n';
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
  useLanguage();
  return (
    <div className="rubric-list">
      {items.map((item) => (
        <article className="rubric-question" key={item.id} data-testid={`rubric-${item.id}`}>
          <div className="rubric-title">
            <strong>{item.id}</strong>
            <span className="primitive">{item.type.toUpperCase()}</span>
            <span className={`status ${item.status}`}>{statusLabels[item.status]}</span>
          </div>
          <h4>{tx(item.text)}</h4>
          <p className="rubric-answer">
            {item.applicable === false
              ? t('Tidak diterapkan pada hasil ini')
              : tx(item.label) || t('Belum dievaluasi')}
          </p>
          {tx(item.note) && <p className="detail-note">{tx(item.note)}</p>}
          {item.answer && item.applicable !== false && (
            <p className="detail-note">
              {item.type === 'noul' ? (
                <>
                  {t('Dukungan bukti') + ' '}
                  {Math.round(item.answer.noul * 100)}
                  {t(
                    '% · batas aplikasi: ≤40% tidak mendukung, ≥60% mendukung. Bukan confidence tambahan.',
                  ) + ' '}
                </>
              ) : (
                <>
                  {t('Confidence penilaian') + ' '}
                  {Math.round(item.answer.confidence * 100)}
                  {t('% · bukan probabilitas transaksi berhasil.') + ' '}
                </>
              )}
            </p>
          )}
          {!!item.source_ids.length && (
            <>
              <button
                className="evidence-link"
                onClick={() => onQuestion(item)}
                aria-label={t('Sorot sumber di graph {0}', [item.id])}
              >
                {t('Sorot sumber di graph ·') + ' '}
                {item.source_ids.length} {t('record') + ' '}
              </button>
              <details>
                <summary>
                  {t('Record sumber') + ' '}
                  {item.id}
                </summary>
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
              <summary>
                {t('Pemeriksaan kode') + ' '}
                {item.id}
              </summary>
              {item.checks.map((check) => (
                <p key={check.id}>
                  <strong>
                    {check.passed === true
                      ? t('Terpenuhi')
                      : check.passed === false
                        ? t('Belum terpenuhi')
                        : t('Belum diperiksa')}
                    :
                  </strong>{' '}
                  {tx(check.message)}
                </p>
              ))}
            </details>
          )}
          {item.answer && (
            <details>
              <summary>
                {t('Detail penilaian') + ' '}
                {item.id}
              </summary>
              {item.answer.probabilities && (
                <div className="distribution">
                  {Object.entries(item.answer.probabilities as Record<string, number>).map(
                    ([key, value]) => (
                      <div className="probability" key={key}>
                        <span>
                          {tx(
                            Array.isArray(item.criteria)
                              ? item.criteria[Number(key)]
                              : item.criteria[key],
                          ) || key}
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
