import { t, presentText as tx, useLanguage } from './i18n';
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
  useLanguage();
  const result = run.result;
  if (!result || !['done', 'review'].includes(run.status)) return null;
  const reasons: ReviewReason[] = run.review_reasons || result.review_reasons || [];
  const summary: ValidationSummary | undefined = result.validation_summary;
  const modern = run.rubric_version === 'expansion-v2.0';
  return (
    <section className="analysis-summary" aria-label={t('Ringkasan analisis')}>
      <span className="eyebrow">{t('KESIMPULAN ANALISIS')}</span>
      <h3>
        {tx(summary?.title) || (modern ? t('Validasi tersimpan belum lengkap') : tx(result.title))}
      </h3>
      {modern && <ScoreHeadline score={result.expansion_score} />}
      <p>
        {summary
          ? t('{0} · {1}', [tx(summary.signal_type), tx(summary.summary)])
          : modern
            ? t('Periksa detail validasi tersimpan.')
            : tx(result.intent_label) || t('Belum ada niat ekspansi yang cukup jelas.')}
        {!modern && result.intent && (
          <>
            {' '}
            {t('· Confidence niat') + ' '}
            {Math.round(result.intent.confidence * 100)}%
          </>
        )}
      </p>
      {summary && (
        <>
          <p>
            {summary.supporting_record_count} {t('record pendukung ·') + ' '}
            {summary.source_count} {t('sumber data berbeda ·') + ' '}
            {summary.evaluated_record_count} {t('record dievaluasi') + ' '}
          </p>
          {summary.limitations.map((note) => (
            <p key={tx(note)}>{tx(note)}</p>
          ))}
        </>
      )}
      <p>
        {t('Estimasi tambahan bruto')}{' '}
        <strong>
          {money(result.calculation?.gross_annual)}
          {result.calculation?.gross_annual != null && t('/tahun')}
        </strong>{' '}
        {summary && <> · {tx(summary.estimate_label)}</>} ·{' '}
        {tx(summary?.action_label) || tx(result.action_label)}
      </p>
      {run.status === 'review' && (
        <p className="review-summary">
          <strong>{t('Perlu ditinjau:')}</strong>{' '}
          {tx(reasons[0]?.message) || t('Detail pemicu belum tersedia. Periksa evaluasi asli.')}
          {reasons.length > 1 && t(' Ada {0} alasan lain pada detail hasil.', [reasons.length - 1])}
        </p>
      )}
      <small>
        {t(
          'Selesai berarti evaluasi selesai tanpa pemicu review, bukan jaminan hasil benar. Estimasi merupakan skenario, bukan pendapatan pasti. Confidence di detail hanya berlaku pada parameter terkait.',
        ) + ' '}
      </small>
      <button
        className="primary"
        onClick={onDetails}
        aria-expanded={expanded}
        aria-controls="analysis-explanation"
      >
        {expanded ? t('Tutup penjelasan') : t('Lihat penjelasan hasil')}
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
  useLanguage();
  const reasons: ReviewReason[] = run.review_reasons || run.result?.review_reasons || [];
  const nextSteps: NextStep[] = run.next_steps || run.result?.next_steps || [];
  const needsReview = run.result?.validation_summary?.status === 'review';
  return (
    <>
      <ExpansionScoreDetails score={run.result?.expansion_score} onSources={onStage} />
      <section className="review-guidance" aria-label={t('Alasan status analisis')}>
        <h4>{t('Yang perlu ditinjau')}</h4>
        {reasons.length ? (
          reasons.map((reason, index) => (
            <article className="review-reason" key={`${reason.code}-${index}`}>
              <strong>{tx(reason.title)}</strong>
              <p>{tx(reason.message)}</p>
              <button
                className="evidence-link"
                onClick={() => onStage(reason.stage, reason.source_ids)}
              >
                {t('Buka tahap:')}{' '}
                {tx(run.steps.find((step) => step.id === reason.stage)?.title) ||
                  t('Kumpulkan konteks')}
              </button>
            </article>
          ))
        ) : (
          <p>
            {run.status === 'review'
              ? t(
                  'Informasi tersimpan belum cukup untuk menjelaskan pemicu status ini. Periksa log evaluasi asli.',
                )
              : t('Tidak ada pemicu status Perlu ditinjau pada hasil ini.')}
          </p>
        )}
      </section>
      <section className="next-action" aria-label={t('Langkah berikutnya')}>
        <span className="eyebrow">
          {needsReview ? t('USULAN SETELAH VERIFIKASI') : t('LANGKAH BERIKUTNYA')}
        </span>
        {nextSteps.length ? (
          nextSteps.map((step, index) => (
            <div key={index}>
              <h3>{tx(step.action)}</h3>
              {!!step.verification?.length && (
                <ul>
                  {step.verification.map((item, i) => (
                    <li key={i}>
                      {item.parameter_id ? `${item.parameter_id}: ` : ''}
                      {tx(item.message)}
                      {item.source_ids.length
                        ? t(' Sumber: {0}.', [item.source_ids.join(', ')])
                        : ''}
                    </li>
                  ))}
                </ul>
              )}
              <p>
                {t('Penanggung jawab:') + ' '}
                <strong>
                  {step.owner === 'Owner belum ditentukan' || step.owner === 'Owner not assigned'
                    ? tx(step.owner)
                    : step.owner}
                </strong>
              </p>
              <h4>{t('Yang perlu dikonfirmasi')}</h4>
              <ul>
                {step.confirmations.map((item, i) => (
                  <li key={i}>{tx(item)}</li>
                ))}
              </ul>
              <p>
                <strong>{t('Hasil yang diharapkan:')}</strong> {tx(step.expected_outcome)}
              </p>
            </div>
          ))
        ) : (
          <>
            <h3>{tx(run.result?.action_label) || t('Lengkapi informasi')}</h3>
            <p>
              {t(
                'Detail tindakan belum tersedia pada hasil lama ini. Periksa sumber dan evaluasi asli.',
              ) + ' '}
            </p>
          </>
        )}
        <small>{t('Usulan tindak lanjut, bukan komitmen pelanggan.')}</small>
      </section>
    </>
  );
}
