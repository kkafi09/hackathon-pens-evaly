import { t, presentText as tx, useLanguage } from './i18n';
import { scorePercent, type ExpansionScore } from './types';

export function ScoreHeadline({ score }: { score?: ExpansionScore | null }) {
  useLanguage();
  if (!score) return null;
  return (
    <div aria-label={t('Skor dukungan ekspansi')} className="my-4">
      <p>
        <strong>
          {t('Skor dukungan ekspansi')}
          {score.display_value != null ? `: ${scorePercent(score.display_value)}` : ''}
        </strong>
      </p>
      {tx(score.unavailable_reason) && <p>{tx(score.unavailable_reason)}</p>}
      <small>{t('Dihitung dari rubrik validasi; bukan probabilitas deal menang.')}</small>
    </div>
  );
}

export default function ExpansionScoreDetails({
  score,
  onSources,
}: {
  score?: ExpansionScore;
  onSources: (group: string, ids: string[]) => void;
}) {
  useLanguage();
  if (!score) return null;
  const contribution = (value: number | null) =>
    value == null ? t('Belum tersedia') : scorePercent(value * 100);
  return (
    <section aria-label={t('Bagaimana skor dihitung')} className="my-5 min-w-0">
      <h4>{t('Bagaimana skor dihitung')}</h4>
      <p>{tx(score.note)}</p>
      <p>
        {t(
          'Skor kelompok = rata-rata kontribusi parameter yang berlaku. Skor dasar = rata-rata kelompok berbobot. Skor akhir dibatasi dukungan OI-1, EP-1, dan EP-4.',
        ) + ' '}
      </p>
      <p>
        {score.evaluated_count}/{score.applicable_count}{' '}
        {t(
          'parameter yang berlaku memiliki jawaban valid. Semua 19 parameter tercantum di bawah.',
        ) + ' '}
      </p>
      <ul>
        {score.groups.map((group) => (
          <li key={group.id}>
            {tx(group.label)}
            {t(': bobot') + ' '}
            {group.policy_weight}% ·{' '}
            {group.applicable
              ? t('{0} · bobot efektif {1}', [
                  contribution(group.value),
                  scorePercent(group.effective_weight * 100),
                ])
              : t('Tidak berlaku pada agregasi')}
          </li>
        ))}
      </ul>
      <p>
        {t('Skor dasar:') + ' '}
        {score.base_score == null ? t('Belum tersedia') : scorePercent(score.base_score)}{' '}
        {t('· Batas bukti:') + ' '}
        {score.cap_score == null ? t('Belum tersedia') : scorePercent(score.cap_score)}
      </p>
      {!!score.limiting_parameter_ids.length && (
        <p>
          {t('Pembatas skor akhir:') + ' '}
          {score.limiting_parameter_ids.join(', ')}.
        </p>
      )}
      <div className="max-w-full overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>{t('Parameter')}</th>
              <th>{t('Kontribusi mentah')}</th>
              <th>{t('Penelusuran')}</th>
            </tr>
          </thead>
          <tbody>
            {score.parameters.map((item) => (
              <tr key={item.id} data-testid={`score-${item.id}`}>
                <td className="p-2 align-top">
                  <strong>{item.id}</strong>
                  <p>{tx(item.text)}</p>
                </td>
                <td className="p-2 align-top">
                  {item.applicable ? contribution(item.raw_value) : t('Tidak berlaku')}
                  {item.adjustments.map((note) => (
                    <p key={tx(note)}>{tx(note)}</p>
                  ))}
                </td>
                <td className="p-2 align-top">
                  {!!item.source_ids.length && (
                    <button
                      className="evidence-link"
                      onClick={() => onSources(item.group, item.source_ids)}
                    >
                      {t('Sumber') + ' '}
                      {item.id} · {item.source_ids.length} {t('record') + ' '}
                    </button>
                  )}
                  <details>
                    <summary>{t('Jawaban asli')}</summary>
                    <pre className="max-w-52 whitespace-pre-wrap break-all">
                      {JSON.stringify(item.answer, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small>
        {t('Aturan perhitungan:') + ' '}
        {score.version}
      </small>
    </section>
  );
}
