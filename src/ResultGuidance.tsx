import { money, type Run, type ReviewReason, type NextStep } from './types';
import { ChevronDown } from 'lucide-react';

export function AnalysisSummary({
  run,
  onDetails,
  expanded,
}: {
  run: Run;
  onDetails: () => void;
  expanded: boolean;
}) {
  const result = run.result;
  if (!result) return null;
  const reasons: ReviewReason[] = run.review_reasons || result.review_reasons || [];
  return (
    <section className="analysis-summary" aria-label="Ringkasan analisis">
      <span className="eyebrow">KESIMPULAN ANALISIS</span>
      <h3>{result.title}</h3>
      <p>
        {result.intent_label || 'Belum ada niat ekspansi yang cukup jelas.'}
        {result.intent && <> · Confidence niat {Math.round(result.intent.confidence * 100)}%</>}
      </p>
      <p>
        Estimasi tambahan bruto{' '}
        <strong>
          {money(result.calculation?.gross_annual)}
          {result.calculation?.gross_annual != null && '/tahun'}
        </strong>{' '}
        · {result.action_label}
      </p>
      {run.status === 'review' && (
        <p className="review-summary">
          <strong>Perlu ditinjau:</strong>{' '}
          {reasons[0]?.message || 'Detail pemicu belum tersedia. Periksa evaluasi asli.'}
          {reasons.length > 1 && ` Ada ${reasons.length - 1} alasan lain pada detail hasil.`}
        </p>
      )}
      <small>
        Estimasi merupakan skenario, bukan pendapatan pasti. Confidence adalah kepastian penilaian
        model, bukan probabilitas deal menang.
      </small>
      <button
        className="primary"
        onClick={onDetails}
        aria-expanded={expanded}
        aria-controls="analysis-explanation"
      >
        {expanded ? 'Tutup penjelasan' : 'Lihat penjelasan hasil'}
        <ChevronDown size={15} className={expanded ? 'rotate' : ''} />
      </button>
    </section>
  );
}

export default function ResultGuidance({
  run,
  onStage,
}: {
  run: Run;
  onStage: (stage: string, ids: string[]) => void;
}) {
  const reasons: ReviewReason[] = run.review_reasons || run.result?.review_reasons || [];
  const nextSteps: NextStep[] = run.next_steps || run.result?.next_steps || [];
  return (
    <>
      <section className="review-guidance" aria-label="Alasan status analisis">
        <h4>Yang perlu ditinjau</h4>
        {reasons.length ? (
          reasons.map((reason, index) => (
            <article className="review-reason" key={`${reason.code}-${index}`}>
              <strong>{reason.title}</strong>
              <p>{reason.message}</p>
              <button
                className="evidence-link"
                onClick={() => onStage(reason.stage, reason.source_ids)}
              >
                Buka tahap:{' '}
                {run.steps.find((step) => step.id === reason.stage)?.title || 'Kumpulkan konteks'}
              </button>
            </article>
          ))
        ) : (
          <p>
            {run.status === 'review'
              ? 'Informasi tersimpan belum cukup untuk menjelaskan pemicu status ini. Periksa log evaluasi asli.'
              : 'Tidak ada pemicu status Perlu ditinjau pada hasil ini.'}
          </p>
        )}
      </section>
      <section className="next-action" aria-label="Langkah berikutnya">
        <span className="eyebrow">LANGKAH BERIKUTNYA</span>
        {nextSteps.length ? (
          nextSteps.map((step, index) => (
            <div key={index}>
              <h3>{step.action}</h3>
              <p>
                Penanggung jawab: <strong>{step.owner}</strong>
              </p>
              <h4>Yang perlu dikonfirmasi</h4>
              <ul>
                {step.confirmations.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
              <p>
                <strong>Hasil yang diharapkan:</strong> {step.expected_outcome}
              </p>
            </div>
          ))
        ) : (
          <>
            <h3>{run.result?.action_label || 'Lengkapi informasi'}</h3>
            <p>
              Detail tindakan belum tersedia pada hasil lama ini. Periksa sumber dan evaluasi asli.
            </p>
          </>
        )}
        <small>Usulan tindak lanjut, bukan komitmen pelanggan.</small>
      </section>
    </>
  );
}
