import { money, type Run, type ReviewReason, type NextStep, type ValidationSummary } from './types';
import { ChevronDown } from 'lucide-react';
import ExpansionScoreDetails, { ScoreHeadline } from './ExpansionScoreView';

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
  if (!result || !['done', 'review'].includes(run.status)) return null;
  const reasons: ReviewReason[] = run.review_reasons || result.review_reasons || [];
  const summary: ValidationSummary | undefined = result.validation_summary;
  const modern = run.rubric_version === 'expansion-v2.0';
  return (
    <section className="analysis-summary" aria-label="Ringkasan analisis">
      <span className="eyebrow">KESIMPULAN ANALISIS</span>
      <h3>{summary?.title || (modern ? 'Validasi tersimpan belum lengkap' : result.title)}</h3>
      {modern && <ScoreHeadline score={result.expansion_score} />}
      <p>
        {summary
          ? `${summary.signal_type} · ${summary.summary}`
          : modern
            ? 'Periksa detail validasi tersimpan.'
            : result.intent_label || 'Belum ada niat ekspansi yang cukup jelas.'}
        {!modern && result.intent && (
          <> · Confidence niat {Math.round(result.intent.confidence * 100)}%</>
        )}
      </p>
      {summary && (
        <>
          <p>
            {summary.supporting_record_count} record pendukung · {summary.source_count} sumber data
            berbeda · {summary.evaluated_record_count} record dievaluasi
          </p>
          {summary.limitations.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </>
      )}
      <p>
        Estimasi tambahan bruto{' '}
        <strong>
          {money(result.calculation?.gross_annual)}
          {result.calculation?.gross_annual != null && '/tahun'}
        </strong>{' '}
        {summary && <> · {summary.estimate_label}</>} ·{' '}
        {summary?.action_label || result.action_label}
      </p>
      {run.status === 'review' && (
        <p className="review-summary">
          <strong>Perlu ditinjau:</strong>{' '}
          {reasons[0]?.message || 'Detail pemicu belum tersedia. Periksa evaluasi asli.'}
          {reasons.length > 1 && ` Ada ${reasons.length - 1} alasan lain pada detail hasil.`}
        </p>
      )}
      <small>
        Selesai berarti evaluasi selesai tanpa pemicu review, bukan jaminan hasil benar. Estimasi
        merupakan skenario, bukan pendapatan pasti. Confidence di detail hanya berlaku pada
        parameter terkait.
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
  const needsReview = run.result?.validation_summary?.status === 'review';
  return (
    <>
      <ExpansionScoreDetails score={run.result?.expansion_score} onSources={onStage} />
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
        <span className="eyebrow">
          {needsReview ? 'USULAN SETELAH VERIFIKASI' : 'LANGKAH BERIKUTNYA'}
        </span>
        {nextSteps.length ? (
          nextSteps.map((step, index) => (
            <div key={index}>
              <h3>{step.action}</h3>
              {!!step.verification?.length && (
                <ul>
                  {step.verification.map((item, i) => (
                    <li key={i}>
                      {item.parameter_id ? `${item.parameter_id}: ` : ''}
                      {item.message}
                      {item.source_ids.length ? ` Sumber: ${item.source_ids.join(', ')}.` : ''}
                    </li>
                  ))}
                </ul>
              )}
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
