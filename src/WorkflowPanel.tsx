import { number, t, tx, presentText, useLanguage, locale, withLanguage } from './i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Download,
  ExternalLink,
  History as HistoryIcon,
  Play,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import EvidenceView from './EvidenceView';
import RubricView from './RubricView';
import { Collapse, useAnimatedTab, useReducedMotion } from './motion';
import ResultGuidance, { AnalysisSummary } from './ResultGuidance';
import DeleteRunDialog from './DeleteRunDialog';
import {
  type Evidence,
  api,
  dateTime,
  money,
  statusLabels,
  type Context,
  type GraphItem,
  type History,
  type RecordData,
  type Run,
  type RubricDefinition,
  type RubricEvaluation,
} from './types';
const descriptions = [
  'Hubungkan kontrak, percakapan, kontak, usage, dan tiket akun.',
  'Choice memilah tujuan utama setiap pesan dengan bukti percakapannya.',
  'Score membedakan eksplorasi, rencana konkret, dan permintaan penawaran.',
  'Noul menilai apakah ada syarat eksplisit sebelum ekspansi.',
  'Kode menghitung nilai. Choice memilih langkah yang sesuai konteks.',
];
const sourceNames: Record<string, string> = {
  contacts: 'Kontak',
  employment_history: 'Riwayat kerja',
  interactions: 'Email & meeting',
  contracts: 'Kontrak',
  deals: 'Deal',
  decisions: 'Keputusan',
  tickets: 'Tiket support',
  outlets: 'Outlet',
  feature_usage: 'Usage fitur',
  product_usage_daily: 'Transaksi harian',
  pipeline_candidates: 'Kandidat jalur pipeline',
};
const classNames: Record<string, string> = {
  expansion: 'Ekspansi',
  complaint: 'Keluhan',
  renewal: 'Renewal',
  other: 'Lainnya',
  unclear: 'Tidak jelas',
};
export default function WorkflowPanel({
  account,
  context,
  contextError = '',
  jevConfigured,
  onClose,
  onEvidence,
  onEvidenceSet,
  onFocusEvidence,
  initialRunId = null,
  onRunChange,
  exiting = false,
}: {
  initialRunId?: string | null;
  onRunChange?: (id: string | null) => void;
  exiting?: boolean;
  account: GraphItem;
  context: Context | null;
  contextError?: string;
  jevConfigured: boolean;
  onClose: () => void;
  onEvidence: (id: string) => void;
  onEvidenceSet: (items: Evidence[]) => void;
  onFocusEvidence: () => void;
}) {
  useLanguage();
  const [definition, setDefinition] = useState<RubricDefinition | null>(null);
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [replay, setReplay] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('workflow');
  const animatedTab = useAnimatedTab(tab);
  const visibleTab = animatedTab.visible;
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigationTarget = useRef<string | null>(null);
  const [navigationVersion, setNavigationVersion] = useState(0);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [returnToExplanation, setReturnToExplanation] = useState(false);
  const reducedMotion = useReducedMotion();
  function navigate(next: string, target: string | null = null) {
    navigationTarget.current = target;
    setTab(next);
    setNavigationVersion((version) => version + 1);
  }
  useEffect(() => {
    if (animatedTab.phase !== 'idle') return;
    const container = scrollRef.current;
    if (!container) return;
    const selector = navigationTarget.current;
    if (!selector) {
      container.scrollTop = 0;
      return;
    }
    const focusTarget = () => {
      if (navigationTarget.current !== selector) return;
      const target = container.querySelector<HTMLElement>(selector);
      if (!target) return;
      container.scrollTo({
        top:
          target.getBoundingClientRect().top -
          container.getBoundingClientRect().top +
          container.scrollTop -
          12,
        behavior: reducedMotion ? 'instant' : 'smooth',
      });
      target.focus({ preventScroll: true });
      navigationTarget.current = null;
    };
    // Collapsing content changes scroll height; wait for its 250ms transition.
    if (reducedMotion) {
      focusTarget();
      return;
    }
    const timer = setTimeout(focusTarget, 260);
    return () => clearTimeout(timer);
  }, [visibleTab, animatedTab.phase, navigationVersion, reducedMotion]);
  const [showHistory, setShowHistory] = useState(false);
  const [sourceMode, setSourceMode] = useState<'records' | 'support' | 'all'>('records');
  const [proofMode, setProofMode] = useState<'auto' | 'stage' | 'all' | 'support' | 'question'>(
    'auto',
  );
  const [deleteTarget, setDeleteTarget] = useState<History | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const running = run?.status === 'running' || run?.status === 'waiting';
  const runId = run?.id;
  const chosenRunId = useRef<string | undefined>(undefined);
  const chooseRun = useCallback((next: Run | null) => {
    if (next?.id !== chosenRunId.current) {
      setExplanationOpen(false);
      setReturnToExplanation(false);
      setSourceMode('records');
      setQuestionIds([]);
      navigationTarget.current = null;
    }
    chosenRunId.current = next?.id;
    setRun(next);
  }, []);

  useEffect(() => {
    onRunChange?.(runId || null);
  }, [runId, onRunChange]);
  useEffect(() => {
    document
      .querySelector<HTMLElement>('.workflow-panel .close-icon')
      ?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    let live = true;
    api<RubricDefinition>('/expansion-rubric')
      .then((value) => {
        if (live) setDefinition(value);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    api<History[]>(`/accounts/${account.id}/expansion-runs`)
      .then((x) => {
        if (live) setHistory(x);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [account.id]);
  useEffect(() => {
    if (!initialRunId) return;
    let live = true;
    api<Run>(`/expansion-runs/${initialRunId}`)
      .then((next) => {
        if (!live) return;
        chooseRun(next);
        setReplay(!['running', 'waiting'].includes(next.status));
        navigate(next.result && ['done', 'review'].includes(next.status) ? 'results' : 'workflow');
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [initialRunId, chooseRun]);
  useEffect(() => {
    if (!running || replay || !runId) return;
    let live = true;
    const poll = async () => {
      try {
        const next = await api<Run>(`/expansion-runs/${runId}`);
        if (!live) return;
        setRun(next);
        if (!['running', 'waiting'].includes(next.status)) {
          const entries = await api<History[]>(`/accounts/${account.id}/expansion-runs`);
          if (live) setHistory(entries);
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    };
    const timer = setInterval(poll, 1000);
    poll();
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [runId, running, replay, account.id]);
  async function start() {
    setBusy(true);
    setError('');
    setReplay(false);
    navigate('workflow');
    setProofMode('auto');
    try {
      chooseRun(await api<Run>(`/accounts/${account.id}/expansion-runs`, { method: 'POST' }));
      setExpanded(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load(id: string) {
    setBusy(true);
    setError('');
    try {
      const next = await api<Run>(`/expansion-runs/${id}`);
      chooseRun(next);
      setProofMode('auto');
      setReplay(!['running', 'waiting'].includes(next.status));
      navigate(next.result && ['done', 'review'].includes(next.status) ? 'results' : 'workflow');
      setShowHistory(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function requestDelete(target: History) {
    setDeleteError('');
    setDeleteTarget(target);
  }
  async function removeRun() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api<void>(`/expansion-runs/${deleteTarget.id}`, { method: 'DELETE' });
      setHistory((entries) => entries.filter((entry) => entry.id !== deleteTarget.id));
      if (run?.id === deleteTarget.id) {
        chooseRun(null);
        setReplay(false);
        setExpanded(0);
        navigate('workflow');
        setProofMode('auto');
        setError('');
      }
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  function showReviewStage(stage: string, ids: string[]) {
    const index = run?.steps.findIndex((step) => step.id === stage) ?? -1;
    setExpanded(index >= 0 ? index : 0);
    setReturnToExplanation(true);
    setQuestionIds(ids);
    setProofMode(ids.length ? 'question' : 'stage');
    navigate(
      'workflow',
      `#workflow-stage-${CSS.escape(run?.steps[index >= 0 ? index : 0]?.id || '')}`,
    );
  }
  const result = run?.result;
  const calc = result?.calculation;
  const steps =
    run?.steps ||
    (definition?.steps || []).map((step) => ({
      ...step,
      status: 'waiting' as const,
      data: null,
      question_count: 0,
    }));
  function showQuestion(item: RubricEvaluation) {
    setQuestionIds(item.source_ids);
    setProofMode('question');
  }
  function evaluations(group: string): RubricEvaluation[] {
    if (run?.rubric) return Object.values(run.rubric).filter((item) => item.group === group);
    if (run) return [];
    return (definition?.questions || [])
      .filter((item) => item.group === group)
      .map((item) => ({
        ...item,
        status: 'waiting',
        answer: null,
        source_ids: [],
        checks: [],
        applicable: true,
      }));
  }
  const supporting =
    proofMode === 'support' || (proofMode === 'auto' && !!result && visibleTab === 'results');
  const proof = useMemo<Evidence[]>(() => {
    if (!run) return [];
    if (proofMode === 'question')
      return (
        run.result?.evaluated_provenance || run.steps.flatMap((step) => step.provenance || [])
      ).filter((item: Evidence) => questionIds.includes(item.id));
    if (proofMode === 'all')
      return (
        run.result?.evaluated_provenance || [
          ...new Map(
            run.steps.flatMap((step) => step.provenance || []).map((item) => [item.id, item]),
          ).values(),
        ]
      );
    if (supporting) return run.result?.provenance || [];
    return run.steps[expanded ?? 0]?.provenance || [];
  }, [run, expanded, proofMode, supporting, questionIds]);
  useEffect(() => {
    if (!exiting) onEvidenceSet(proof);
  }, [proof, onEvidenceSet, exiting]);
  return (
    <aside
      className={`workflow-panel ${exiting ? 'motion-exit' : 'motion-enter'}`}
      inert={exiting}
      aria-label={`Account Expansion ${account.id}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !(event.target as HTMLElement).closest('dialog[open]')) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="panel-heading">
        <span className="eyebrow">
          <Sparkles size={12} /> ACCOUNT EXPANSION
        </span>
        <button className="close-icon" aria-label={t('Tutup workflow')} onClick={onClose}>
          <X size={19} />
        </button>
        <h2>{account.label}</h2>
        <div className="account-meta">
          <span>{account.id}</span>
          <span>{account.record.paket}</span>
          <span>
            {account.record.jumlah_outlet} {t('outlet')}
          </span>
          <span>{context?.owner?.nama || t('Memuat owner…')}</span>
        </div>
      </div>
      <div className="panel-tabs">
        <button
          className={tab === 'workflow' ? 'active' : ''}
          onClick={() => {
            navigate('workflow');
            setProofMode('stage');
          }}
        >
          {t('Workflow analisis') + ' '}
        </button>
        <button
          className={tab === 'sources' ? 'active' : ''}
          onClick={() => {
            navigate('sources');
            if (sourceMode !== 'records') setProofMode(sourceMode);
          }}
        >
          {t('Data & bukti') + ' '}
          <span>{context?.interactions.length || 0}</span>
        </button>
        <button
          className={tab === 'results' ? 'active' : ''}
          onClick={() => {
            navigate('results');
            setProofMode('support');
          }}
          disabled={!result}
        >
          {t('Hasil analisis') + ' '}
        </button>
      </div>
      <div ref={scrollRef} className={`panel-scroll tab-${animatedTab.phase}`}>
        {run && (
          <div className="run-status" role="status">
            <strong>{statusLabels[run.status]}</strong>
            <span>
              {replay ? t('Pemutaran ulang hasil · ') : ''}
              {dateTime(run.created_at)}
            </span>
            {run.stale && (
              <span className="stale-note">
                {t('Versi dataset berbeda; periksa bukti tersimpan.')}
              </span>
            )}
          </div>
        )}
        {visibleTab === 'workflow' && (
          <>
            <div className="run-control">
              <div>
                <span className="eyebrow">JEV · SYSTEM ONE</span>
                <h3>{t('Dari konteks menjadi keputusan.')}</h3>
                <p>{t('Lihat sumber, pertanyaan, dan hasil pada setiap tahap.')}</p>
              </div>
              <button className="primary" disabled={busy || running || !context} onClick={start}>
                {busy || running ? <span className="spinner" /> : <Play size={14} />}
                {running ? t('Analisis berjalan') : t('Jalankan analisis baru')}
              </button>
              <button
                className="secondary"
                onClick={() => setShowHistory(!showHistory)}
                disabled={!history.length}
              >
                <HistoryIcon size={14} /> {t('Lihat hasil tersimpan') + ' '}
                <span>{history.length}</span>
              </button>
            </div>
            {!jevConfigured && (
              <div className="notice">
                <ShieldCheck size={16} />
                <span>
                  {t(
                    'API key OpenRouter belum diatur. Data sumber tetap tersedia. Analisis baru memerlukan konfigurasi backend; hasil tersimpan dapat dibuka jika tersedia.',
                  ) + ' '}
                </span>
              </div>
            )}
            {showHistory && (
              <div className="history-list">
                <h4>{t('Riwayat evaluasi akun')}</h4>
                {history.map((h) => (
                  <div className="history-row" key={h.id}>
                    <button disabled={busy} onClick={() => load(h.id)}>
                      <Clock3 size={15} />
                      <span>
                        {dateTime(h.created_at)}
                        <small>
                          {h.gateway || 'typesafe'} · {h.model || t('Belum ada respons Jev')} ·{' '}
                          {statusLabels[h.status]} {h.stale ? t('· Berbeda versi data') : ''}
                        </small>
                      </span>
                      <ArrowRight size={14} />
                    </button>
                    <button
                      className="delete-history"
                      aria-label={t('Hapus hasil {0}', [dateTime(h.created_at)])}
                      disabled={!['done', 'review', 'failed'].includes(h.status) || busy}
                      onClick={() => requestDelete(h)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {(error || run?.error) && (
              <div className="error-box" role="alert">
                <strong>{t('Analisis belum dapat diselesaikan')}</strong>
                <p>{presentText(error || run?.error)}</p>
              </div>
            )}
          </>
        )}
        {visibleTab === 'workflow' && (
          <>
            {returnToExplanation && (
              <button
                className="secondary return-explanation"
                onClick={() => {
                  setExplanationOpen(true);
                  navigate('results', '#analysis-explanation-heading');
                }}
              >
                {t('Kembali ke penjelasan hasil') + ' '}
              </button>
            )}
            <div className="section-label">
              <span>{t('ALUR PENALARAN')}</span>
              <span>{run ? statusLabels[run.status] : t('Siap dijalankan')}</span>
            </div>
            <div className="workflow-steps">
              {steps.map((step, i) => {
                const calls = run?.calls.filter((c) => c.stage === step.id) || [];
                return (
                  <div className={`workflow-step ${step.status}`} key={step.id}>
                    <div className="step-track">
                      <span className="step-index">
                        {step.status === 'done' ? (
                          <Check size={14} />
                        ) : step.status === 'running' ? (
                          <span className="spinner" />
                        ) : (
                          `0${i + 1}`
                        )}
                      </span>
                      {i < steps.length - 1 && <span className="step-line" />}
                    </div>
                    <div className="step-content">
                      <button
                        className="step-toggle"
                        id={`workflow-stage-${step.id}`}
                        aria-expanded={expanded === i}
                        onClick={() => {
                          setExpanded(expanded === i ? null : i);
                          setProofMode('stage');
                        }}
                      >
                        <div>
                          <span className="primitive">{step.primitive}</span>
                          <h4>{tx(step.title)}</h4>
                          <p>
                            {run && !run.rubric
                              ? tx(descriptions[i])
                              : tx(
                                  definition?.steps.find((entry) => entry.id === step.id)
                                    ?.description,
                                )}
                          </p>
                        </div>
                        <div className="step-right">
                          <span className={`status ${step.status}`}>
                            {statusLabels[step.status]}
                          </span>
                          <ChevronDown size={15} className={expanded === i ? 'rotate' : ''} />
                        </div>
                      </button>
                      <Collapse open={expanded === i}>
                        <div className="step-details">
                          {run && expanded === i && (
                            <EvidenceView
                              items={proof}
                              supporting={supporting}
                              onEvidence={onEvidence}
                              onFocus={onFocusEvidence}
                            />
                          )}

                          {i === 0 && context && (
                            <>
                              <div className="source-grid">
                                {Object.entries(context.source_counts).map(([key, count]) => (
                                  <div key={key}>
                                    <strong>{count.toLocaleString(locale())}</strong>
                                    <span>{tx(sourceNames[key] || key)}</span>
                                  </div>
                                ))}
                              </div>
                              <p className="detail-note">
                                {t(
                                  'Sumber: data/dataset_kasirnusa · Snapshot 1 Oktober 2026. Transaksi harian diagregasikan oleh kode.',
                                ) + ' '}
                              </p>
                              {context.warnings.length > 0 && (
                                <details>
                                  <summary>
                                    {context.warnings.length} {t('catatan kualitas data')}
                                  </summary>
                                  <ul>
                                    {context.warnings.map((x, n) => (
                                      <li key={n}>{tx(x)}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </>
                          )}
                          {i === 1 && step.data?.classifications && (
                            <div className="answer-list">
                              {step.data.classifications.map((a: RecordData) => (
                                <div key={a.interaction_id}>
                                  <Evidence id={a.interaction_id} onClick={onEvidence} />
                                  <span>{tx(classNames[a.choice] || a.choice)}</span>
                                  <small>Confidence {Math.round(a.confidence * 100)}%</small>
                                </div>
                              ))}
                            </div>
                          )}
                          {!run?.rubric && i === 2 && step.data?.intent && (
                            <>
                              <strong className="intent-label">{tx(step.data.label)}</strong>
                              <Distribution answer={step.data.intent} />
                              <div className="evidence-chips">
                                {step.data.source_ids.map((id: string) => (
                                  <Evidence key={id} id={id} onClick={onEvidence} />
                                ))}
                              </div>
                            </>
                          )}
                          {(step.id === 'readiness' || (!run?.rubric && i === 3)) &&
                            step.data?.tickets && (
                              <>
                                <p className="detail-note">
                                  {t(
                                    'Nilai Noul: kemungkinan bukti menyatakan syarat eksplisit sebelum ekspansi. Bukan label penghambat otomatis.',
                                  ) + ' '}
                                </p>
                                <div className="answer-list">
                                  {step.data.tickets.map((a: RecordData) => (
                                    <div key={a.ticket_id}>
                                      <Evidence id={a.ticket_id} onClick={onEvidence} />
                                      <span>Noul</span>
                                      <strong>{number(a.noul, 3)}</strong>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          {step.id === 'result' && calc && (
                            <div className="calculation">
                              <span>{t('PERHITUNGAN KODE')}</span>
                              <strong>
                                {presentText(calc.formula) ||
                                  t('Jumlah tambahan belum dapat dipastikan')}
                              </strong>
                              <p>{presentText(result?.action_label)}</p>
                              {result?.action && (
                                <details>
                                  <summary>{t('Detail penilaian tindak lanjut')}</summary>
                                  <Distribution answer={result.action} />
                                </details>
                              )}
                            </div>
                          )}
                          <RubricView
                            items={evaluations(step.id)}
                            onQuestion={showQuestion}
                            onEvidence={onEvidence}
                          />
                          {presentText(step.data?.note) && <p>{presentText(step.data?.note)}</p>}
                          {i > 0 && !step.data && (
                            <p className="detail-note">
                              {t('Belum dievaluasi. Hasil muncul setelah tahap ini diproses.') +
                                ' '}
                            </p>
                          )}
                          {calls.length > 0 && (
                            <details className="request-log">
                              <summary>
                                {calls.length}{' '}
                                {t('panggilan Jev · pertanyaan, input & respons') + ' '}
                              </summary>
                              {calls.map((call, n) => (
                                <div className="call" key={n}>
                                  <span>
                                    {dateTime(call.at)} · {call.response.model}
                                  </span>
                                  {Object.entries(call.questions).map(([key, q]) => (
                                    <div className="question" key={key}>
                                      <b>
                                        {key} · {q.type}
                                      </b>
                                      <p>{q.instructions}</p>
                                      <pre>{JSON.stringify(q.criteria, null, 2)}</pre>
                                    </div>
                                  ))}
                                  <details>
                                    <summary>{t('State yang dikirim')}</summary>
                                    <pre>{JSON.stringify(call.state, null, 2)}</pre>
                                  </details>
                                  <details>
                                    <summary>{t('Respons asli Jev')}</summary>
                                    <pre>{JSON.stringify(call.response, null, 2)}</pre>
                                  </details>
                                </div>
                              ))}
                            </details>
                          )}
                        </div>
                      </Collapse>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="workflow-caption">
              <ShieldCheck size={14} />{' '}
              {t('Confidence adalah kepastian penilaian model, bukan probabilitas deal menang.') +
                ' '}
            </div>
            {result && (
              <button
                className="primary full"
                onClick={() => {
                  navigate('results');
                  setProofMode('support');
                }}
              >
                {t('Buka hasil analisis') + ' '}
                <ArrowRight size={15} />
              </button>
            )}
          </>
        )}
        {visibleTab === 'sources' && (
          <>
            {contextError && (
              <div className="error-box" role="alert">
                {t('Data sumber belum dapat dimuat:') + ' '}
                {tx(contextError)}
              </div>
            )}
            {run && (
              <div className="proof-controls" aria-label={t('Pilih sumber bukti')}>
                <button
                  aria-pressed={sourceMode === 'records'}
                  onClick={() => setSourceMode('records')}
                >
                  {t('Semua sumber akun') + ' '}
                </button>
                <button
                  aria-pressed={sourceMode === 'support'}
                  disabled={!result}
                  onClick={() => {
                    setSourceMode('support');
                    setProofMode('support');
                  }}
                >
                  {t('Bukti pendukung hasil') + ' '}
                </button>
                <button
                  aria-pressed={sourceMode === 'all'}
                  disabled={
                    !result?.evaluated_provenance?.length &&
                    !run.steps.some((step) => step.provenance?.length)
                  }
                  onClick={() => {
                    setSourceMode('all');
                    setProofMode('all');
                  }}
                >
                  {t('Semua data yang dievaluasi') + ' '}
                </button>
              </div>
            )}
            {sourceMode === 'records' ? (
              !contextError && <SourceView context={context} onEvidence={onEvidence} />
            ) : (
              <>
                {run && !run.steps.some((step) => step.provenance) && (
                  <p className="detail-note">
                    {t(
                      'Detail highlight belum tersedia untuk hasil lama ini. Bukti asli tetap tersedia pada log dan hasil tersimpan.',
                    ) + ' '}
                  </p>
                )}
                <EvidenceView
                  items={proof}
                  supporting={supporting}
                  onEvidence={onEvidence}
                  onFocus={onFocusEvidence}
                />
              </>
            )}
          </>
        )}
        {visibleTab === 'results' && result && calc && run && (
          <section className="analysis-result">
            <AnalysisSummary
              run={run}
              expanded={explanationOpen}
              onDetails={() => {
                setExplanationOpen(!explanationOpen);
                if (!explanationOpen) navigate('results', '#analysis-explanation-heading');
                else navigationTarget.current = null;
              }}
            />
            <Collapse open={explanationOpen}>
              <div id="analysis-explanation">
                <h3 id="analysis-explanation-heading" tabIndex={-1}>
                  {t('Penjelasan hasil') + ' '}
                </h3>
                <ResultGuidance run={run} onStage={showReviewStage} />
                <h4>{t('Estimasi dan asumsi nilai')}</h4>
                <div className="value-grid">
                  <div>
                    <span>{t('Tambahan outlet')}</span>
                    <strong>{calc.additional_outlets ?? '—'}</strong>
                  </div>
                  <div>
                    <span>{t('Existing → target')}</span>
                    <strong>
                      {calc.current_outlets} → {calc.target_outlets ?? '—'}
                    </strong>
                  </div>
                  <div>
                    <span>{t('Tambahan annualized bruto')}</span>
                    <strong>{money(calc.gross_annual)}</strong>
                  </div>
                  <div>
                    <span>{t('Neto · skenario diskon tetap')}</span>
                    <strong>{money(calc.net_annual_scenario)}</strong>
                  </div>
                </div>
                <p className="detail-note">
                  {presentText(calc.formula) ||
                    t('Angka belum dapat dipastikan dari bukti tersedia.')}
                </p>
                {calc.exceeds_package && (
                  <div className="notice warning">
                    {t(
                      'Target melebihi batas paket saat ini. Diskusikan upgrade; harga premium belum dihitung.',
                    ) + ' '}
                  </div>
                )}
                <h4>{t('Asumsi & hal yang perlu dikonfirmasi')}</h4>
                <ul>
                  {[...calc.assumptions, ...result.concerns].map((x: string, i: number) => (
                    <li key={i}>{tx(x)}</li>
                  ))}
                </ul>
                {run.rubric && (
                  <section aria-label={t('Evaluasi rubrik')}>
                    <h4>{t('Evaluasi rubrik · 19 pertanyaan')}</h4>
                    {(definition?.steps || [])
                      .filter((group) => evaluations(group.id).length)
                      .map((group) => (
                        <details key={group.id}>
                          <summary>{tx(group.title)}</summary>
                          <RubricView
                            items={evaluations(group.id)}
                            onQuestion={showQuestion}
                            onEvidence={onEvidence}
                          />
                        </details>
                      ))}
                  </section>
                )}
                {!run.rubric && (
                  <p className="detail-note">
                    {t('Hasil rubrik lama. Pertanyaan v2 belum dievaluasi pada hasil ini.') + ' '}
                  </p>
                )}
                <h4>{t('Bukti dan detail teknis')}</h4>{' '}
                {run && (
                  <>
                    <div className="proof-controls">
                      <button
                        aria-pressed={supporting}
                        onClick={() => setProofMode('support')}
                        disabled={!result}
                      >
                        {t('Bukti pendukung hasil') + ' '}
                      </button>
                      <button
                        aria-pressed={proofMode === 'all'}
                        onClick={() => setProofMode('all')}
                        disabled={!result}
                      >
                        {t('Semua data yang dievaluasi') + ' '}
                      </button>
                    </div>
                    {!run.steps.some((step) => step.provenance) && (
                      <p className="detail-note">
                        {t(
                          'Detail highlight belum tersedia untuk hasil lama ini. Bukti asli tetap tersedia pada log dan hasil tersimpan.',
                        ) + ' '}
                      </p>
                    )}
                    <EvidenceView
                      items={proof}
                      supporting={supporting}
                      onEvidence={onEvidence}
                      onFocus={onFocusEvidence}
                    />
                  </>
                )}
                <h4>{t('Jalur bukti')}</h4>
                <div className="evidence-path">
                  <Evidence id={account.id} onClick={onEvidence} />
                  <ArrowRight size={13} />
                  {result.evidence_ids.map((id: string) => (
                    <Evidence key={id} id={id} onClick={onEvidence} />
                  ))}
                </div>
                {result.precedents?.length > 0 && (
                  <details>
                    <summary>
                      {t('Preseden pembanding ·') + ' '}
                      {result.precedents.length} {t('keputusan akun lain') + ' '}
                    </summary>
                    <p className="detail-note">
                      {t('Dikirim sebagai konteks pembanding, bukan approval untuk akun ini.') +
                        ' '}
                    </p>
                    {result.precedents.map((d: RecordData) => (
                      <div className="source-card" key={d.decision_id}>
                        <strong>
                          {d.decision_id} · {d.account_id} · {d.keputusan}
                        </strong>
                        <p>{d.alasan}</p>
                        <small>decision_log.csv · {d.tanggal}</small>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            </Collapse>
            <button
              className="delete-current"
              disabled={!['done', 'review', 'failed'].includes(run.status) || busy}
              onClick={() => requestDelete(run)}
            >
              <Trash2 size={14} /> {t('Hapus hasil ini') + ' '}
            </button>
            <div className="export-row">
              <a href={withLanguage(`/api/expansion-runs/${run.id}/export/md`)} download>
                <Download size={14} /> {t('Ringkasan Markdown') + ' '}
              </a>
              <a href={withLanguage(`/api/expansion-runs/${run.id}/export/csv`)} download>
                <Download size={14} /> {t('Peluang CSV') + ' '}
              </a>
            </div>
            <details className="metadata">
              <summary>{t('Metadata evaluasi')}</summary>
              <p>
                Gateway: {run.gateway || 'typesafe'}
                <br />
                Model: {run.models.join(', ') || run.model}
                <br />
                {t('Rubrik:') + ' '}
                {run.rubric_version}
                <br />
                {t('Evaluasi:') + ' '}
                {dateTime(run.created_at)}
                <br />
                {t('Hash dataset:') + ' '}
                {run.dataset_hash}
              </p>
            </details>
          </section>
        )}
      </div>
      <DeleteRunDialog
        target={deleteTarget}
        account={t('{0} · {1}', [account.id, account.label])}
        busy={deleting}
        error={tx(deleteError)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={removeRun}
      />
    </aside>
  );
}
function Evidence({ id, onClick }: { id: string; onClick: (id: string) => void }) {
  useLanguage();
  return (
    <button className="evidence-link" onClick={() => onClick(id)}>
      {id}
      <ExternalLink size={10} />
    </button>
  );
}
function Distribution({ answer }: { answer: RecordData }) {
  useLanguage();
  return (
    <div className="distribution">
      <div className="distribution-meta">
        <span>
          {answer.type === 'score'
            ? `Score ${number(answer.score, 2)}`
            : `Choice: ${answer.choice}`}
        </span>
        <span>Confidence {Math.round(answer.confidence * 100)}%</span>
      </div>
      {Object.entries(answer.probabilities as Record<string, number>).map(([key, probability]) => (
        <div className="probability" key={key}>
          <span>{tx(answer.legend?.[key] || key)}</span>
          <div>
            <i style={{ width: `${probability * 100}%` }} />
          </div>
          <small>{Math.round(probability * 100)}%</small>
        </div>
      ))}
    </div>
  );
}
function SourceView({
  context: c,
  onEvidence,
}: {
  context: Context | null;
  onEvidence: (id: string) => void;
}) {
  useLanguage();
  if (!c) return <p>{t('Memuat data sumber…')}</p>;
  const max = Math.max(...c.usage.map((x) => x.transactions), 1);
  return (
    <section className="source-view">
      <h3>{t('Fakta dari data sumber')}</h3>
      <p className="detail-note">
        {t('Bagian ini tersedia sebelum Jev dijalankan. Belum merupakan penilaian model.') + ' '}
      </p>
      <h4>{t('Kontrak & stakeholder')}</h4>
      {c.contracts.map((r) => (
        <div className="source-card" key={r.contract_id}>
          <Evidence id={r.contract_id} onClick={onEvidence} />
          <strong>
            {r.paket} · {r.outlet_kontrak} {t('outlet · batas') + ' '}
            {r.batas_outlet_paket}
          </strong>
          <p>
            {money(Number(r.harga_per_outlet_bulan))}
            {t('/outlet/bulan · diskon') + ' '}
            {r.diskon_pct}%
          </p>
          <small>Renewal {r.tanggal_renewal}</small>
        </div>
      ))}
      <div className="contact-list">
        {c.contacts.map((r) => (
          <div key={r.contact_id}>
            <Evidence id={r.contact_id} onClick={onEvidence} />
            <span>
              {r.nama}
              <small>
                {r.jabatan_saat_ini} · {r.email}
              </small>
            </span>
          </div>
        ))}
      </div>
      <h4>{t('Transaksi server per bulan')}</h4>
      <div className="usage-chart">
        {c.usage.map((r) => (
          <div
            key={r.month}
            title={t('{0}: {1} transaksi; {2} outlet-hari', [
              r.month,
              r.transactions.toLocaleString(locale()),
              r.records,
            ])}
          >
            <i style={{ height: `${Math.max((r.transactions / max) * 100, 2)}%` }} />
            <small>{r.month.slice(5)}</small>
          </div>
        ))}
      </div>
      <p className="detail-note">
        {t(
          'Transaksi yang tercatat server; tidak ditambah transaksi offline. Periksa versi dan sinkronisasi sebelum menyimpulkan tren bisnis.',
        ) + ' '}
      </p>
      <h4>
        {t('Email & catatan meeting ·') + ' '}
        {c.interactions.length}
      </h4>
      {[...c.interactions].reverse().map((r) => (
        <div className="source-card message-card" key={r.interaction_id}>
          <div>
            <Evidence id={r.interaction_id} onClick={onEvidence} />
            <small>
              {r.tanggal} · {r.tipe}
            </small>
          </div>
          <strong>{r.subjek}</strong>
          <small>
            {r.dari} → {r.ke || r.peserta}
          </small>
          <p>{r.isi}</p>
          {r.customer_sender && !r.reply_count && (
            <span className="unanswered">{t('Belum ada balasan tercatat')}</span>
          )}
        </div>
      ))}
      <h4>
        {t('Tiket support ·') + ' '}
        {c.tickets.length}
      </h4>
      {c.tickets.map((r) => (
        <div className="source-card" key={r.ticket_id}>
          <div>
            <Evidence id={r.ticket_id} onClick={onEvidence} />
            <small>
              {r.status} · {r.prioritas}
            </small>
          </div>
          <strong>{r.judul}</strong>
          <p>{r.deskripsi}</p>
          <small>
            {r.dibuat} · {r.kategori}
          </small>
        </div>
      ))}
      <h4>{t('Pipeline & keputusan akun')}</h4>
      <p>
        {c.deals.length} {t('deal dan') + ' '}
        {c.decisions.length}{' '}
        {t('keputusan khusus akun tercatat. Record yang tidak ada tidak dibuat oleh aplikasi.') +
          ' '}
      </p>
      <h4>{t('Kandidat jalur pipeline')}</h4>
      {c.pipeline_candidates?.length ? (
        c.pipeline_candidates.map((item, i) => (
          <div className="source-card" key={i}>
            <strong>{tx(item.label)}</strong>
            <div className="evidence-chips">
              {item.path.map((id: string) => (
                <Evidence key={id} id={id} onClick={onEvidence} />
              ))}
            </div>
            <p>
              {t(
                'Kandidat berbasis record. Relevansi dan kecukupan tindak lanjut dinilai pada PC-1–PC-3.',
              ) + ' '}
            </p>
          </div>
        ))
      ) : (
        <p>
          {t('Belum ditemukan jalur pipeline yang didukung ID atau record sumber untuk akun ini.')}
        </p>
      )}
    </section>
  );
}
