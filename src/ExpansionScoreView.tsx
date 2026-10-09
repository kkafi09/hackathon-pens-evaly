import { scorePercent, type ExpansionScore } from './types';

export function ScoreHeadline({ score }: { score?: ExpansionScore | null }) {
  if (!score) return null;
  return (
    <div aria-label="Skor dukungan ekspansi" className="my-4">
      <p>
        <strong>
          Skor dukungan ekspansi
          {score.display_value != null ? `: ${scorePercent(score.display_value)}` : ''}
        </strong>
      </p>
      {score.unavailable_reason && <p>{score.unavailable_reason}</p>}
      <small>Dihitung dari rubrik validasi; bukan probabilitas deal menang.</small>
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
  if (!score) return null;
  const contribution = (value: number | null) =>
    value == null ? 'Belum tersedia' : scorePercent(value * 100);
  return (
    <section aria-label="Bagaimana skor dihitung" className="my-5 min-w-0">
      <h4>Bagaimana skor dihitung</h4>
      <p>{score.note}</p>
      <p>
        Skor kelompok = rata-rata kontribusi parameter yang berlaku. Skor dasar = rata-rata kelompok
        berbobot. Skor akhir dibatasi dukungan OI-1, EP-1, dan EP-4.
      </p>
      <p>
        {score.evaluated_count}/{score.applicable_count} parameter yang berlaku memiliki jawaban
        valid. Semua 19 parameter tercantum di bawah.
      </p>
      <ul>
        {score.groups.map((group) => (
          <li key={group.id}>
            {group.label}: bobot {group.policy_weight}% ·{' '}
            {group.applicable
              ? `${contribution(group.value)} · bobot efektif ${scorePercent(group.effective_weight * 100)}`
              : 'Tidak berlaku pada agregasi'}
          </li>
        ))}
      </ul>
      <p>
        Skor dasar: {score.base_score == null ? 'Belum tersedia' : scorePercent(score.base_score)} ·
        Batas bukti: {score.cap_score == null ? 'Belum tersedia' : scorePercent(score.cap_score)}
      </p>
      {!!score.limiting_parameter_ids.length && (
        <p>Pembatas skor akhir: {score.limiting_parameter_ids.join(', ')}.</p>
      )}
      <div className="max-w-full overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Kontribusi mentah / efektif</th>
              <th>Bobot efektif / poin</th>
              <th>Penelusuran</th>
            </tr>
          </thead>
          <tbody>
            {score.parameters.map((item) => (
              <tr key={item.id} data-testid={`score-${item.id}`}>
                <td className="p-2 align-top">
                  <strong>{item.id}</strong>
                  <p>{item.text}</p>
                </td>
                <td className="p-2 align-top">
                  {item.applicable
                    ? `${contribution(item.raw_value)} / ${contribution(item.effective_value)}`
                    : 'Tidak berlaku'}
                  {item.adjustments.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </td>
                <td className="p-2 align-top">
                  {scorePercent(item.effective_weight * 100)} /{' '}
                  {item.weighted_points == null
                    ? '—'
                    : item.weighted_points.toLocaleString('id-ID', {
                        maximumFractionDigits: 3,
                      })}{' '}
                  poin
                </td>
                <td className="p-2 align-top">
                  {!!item.source_ids.length && (
                    <button
                      className="evidence-link"
                      onClick={() => onSources(item.group, item.source_ids)}
                    >
                      Sumber {item.id} · {item.source_ids.length} record
                    </button>
                  )}
                  <details>
                    <summary>Jawaban asli</summary>
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
      <small>Aturan perhitungan: {score.version}</small>
    </section>
  );
}
