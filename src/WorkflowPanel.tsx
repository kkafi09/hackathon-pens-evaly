import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  Download,
  ExternalLink,
  History as HistoryIcon,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import EvidenceView from './EvidenceView';
import RubricView from './RubricView';
import { Collapse, useAnimatedTab } from './motion';
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
  jevConfigured: boolean;
  onClose: () => void;
  onEvidence: (id: string) => void;
  onEvidenceSet: (items: Evidence[]) => void;
  onFocusEvidence: () => void;
}) {
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
  const [showHistory, setShowHistory] = useState(false);
  const [proofMode, setProofMode] = useState<'auto' | 'stage' | 'all' | 'support' | 'question'>(
    'auto',
  );
  const [deleteTarget, setDeleteTarget] = useState<History | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const running = run?.status === 'running' || run?.status === 'waiting';
  const runId = run?.id;
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
        setRun(next);
        setReplay(!['running', 'waiting'].includes(next.status));
        setTab(next.result ? 'results' : 'workflow');
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [initialRunId]);
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
    setTab('workflow');
    setProofMode('auto');
    try {
      setRun(await api<Run>(`/accounts/${account.id}/expansion-runs`, { method: 'POST' }));
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
      setRun(next);
      setProofMode('auto');
      setReplay(!['running', 'waiting'].includes(next.status));
      setTab('workflow');
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
        setRun(null);
        setReplay(false);
        setExpanded(0);
        setTab('workflow');
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
  function showReviewStage(stage: string) {
    const index = run?.steps.findIndex((step) => step.id === stage) ?? -1;
    setExpanded(index >= 0 ? index : 0);
    setTab('workflow');
    setProofMode('stage');
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
  const supporting = proofMode === 'support' || (proofMode === 'auto' && !!result);
  const proof = useMemo<Evidence[]>(() => {
    if (!run) return [];
    if (proofMode === 'question')
      return (
        run.result?.evaluated_provenance || run.steps.flatMap((step) => step.provenance || [])
      ).filter((item: Evidence) => questionIds.includes(item.id));
    if (proofMode === 'all') return run.result?.evaluated_provenance || [];
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
        <button className="close-icon" aria-label="Tutup workflow" onClick={onClose}>
          <X size={19} />
        </button>
        <h2>{account.label}</h2>
        <div className="account-meta">
          <span>{account.id}</span>
          <span>{account.record.paket}</span>
          <span>{account.record.jumlah_outlet} outlet</span>
          <span>{context?.owner?.nama || 'Memuat owner…'}</span>
        </div>
      </div>
      <div className="panel-tabs">
        <button className={tab === 'workflow' ? 'active' : ''} onClick={() => setTab('workflow')}>
          Workflow analisis
        </button>
        <button className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}>
          Data & bukti <span>{context?.interactions.length || 0}</span>
        </button>
        <button
          className={tab === 'results' ? 'active' : ''}
          onClick={() => {
            setTab('results');
            setProofMode('support');
          }}
          disabled={!result}
        >
          Hasil analisis
        </button>
      </div>
      <div className={`panel-scroll tab-${animatedTab.phase}`}>
        {run && result && !running && (
          <AnalysisSummary
            run={run}
            onDetails={() => {
              setTab('results');
              setProofMode('support');
            }}
          />
        )}
        {run && (
          <button
            className="delete-current"
            disabled={!['done', 'review', 'failed'].includes(run.status) || busy}
            onClick={() => requestDelete(run)}
          >
            <Trash2 size={14} /> Hapus hasil ini
          </button>
        )}

        <div className="run-control">
          <div>
            <span className="eyebrow">JEV · SYSTEM ONE</span>
            <h3>Dari konteks menjadi keputusan.</h3>
            <p>Lihat sumber, pertanyaan, dan hasil pada setiap tahap.</p>
          </div>
          <button className="primary" disabled={busy || running || !context} onClick={start}>
            {busy || running ? <span className="spinner" /> : <Play size={14} />}
            {running ? 'Analisis berjalan' : 'Jalankan analisis baru'}
          </button>
          <button
            className="secondary"
            onClick={() => setShowHistory(!showHistory)}
            disabled={!history.length}
          >
            <HistoryIcon size={14} /> Lihat hasil tersimpan <span>{history.length}</span>
          </button>
        </div>
        {!jevConfigured && (
          <div className="notice">
            <ShieldCheck size={16} />
            <span>
              API key OpenRouter belum diatur. Data sumber tetap tersedia. Analisis baru memerlukan
              konfigurasi backend; hasil tersimpan dapat dibuka jika tersedia.
            </span>
          </div>
        )}
        {showHistory && (
          <div className="history-list">
            <h4>Riwayat evaluasi akun</h4>
            {history.map((h) => (
              <div className="history-row" key={h.id}>
                <button disabled={busy} onClick={() => load(h.id)}>
                  <Clock3 size={15} />
                  <span>
                    {dateTime(h.created_at)}
                    <small>
                      {h.gateway || 'typesafe'} · {h.model || 'Belum ada respons Jev'} ·{' '}
                      {statusLabels[h.status]} {h.stale ? '· Berbeda versi data' : ''}
                    </small>
                  </span>
                  <ArrowRight size={14} />
                </button>
                <button
                  className="delete-history"
                  aria-label={`Hapus hasil ${dateTime(h.created_at)}`}
                  disabled={!['done', 'review', 'failed'].includes(h.status) || busy}
                  onClick={() => requestDelete(h)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        {replay && run && (
          <div className="notice replay">
            <RotateCcw size={16} />
            <span>
              <strong>Pemutaran ulang hasil</strong>
              <br />
              Evaluasi asli: {dateTime(run.created_at)} · {run.gateway || 'typesafe'} ·{' '}
              {run.model || 'Belum ada respons Jev'}
            </span>
          </div>
        )}
        {run?.stale && (
          <div className="notice warning">
            Hasil ini menggunakan versi dataset berbeda. Bukti pada graph saat ini mungkin sudah
            berubah; periksa state asli pada detail tahap.
          </div>
        )}
        {(error || run?.error) && (
          <div className="error-box" role="alert">
            <strong>Analisis belum dapat diselesaikan</strong>
            <p>{error || run?.error}</p>
          </div>
        )}
        {tab !== 'results' && (
          <>
            {' '}
            {run && (
              <>
                <div className="proof-controls">
                  <button
                    aria-pressed={supporting}
                    onClick={() => setProofMode('support')}
                    disabled={!result}
                  >
                    Bukti pendukung hasil
                  </button>
                  <button
                    aria-pressed={proofMode === 'all'}
                    onClick={() => setProofMode('all')}
                    disabled={!result}
                  >
                    Semua data yang dievaluasi
                  </button>
                </div>
                {!run.steps.some((step) => step.provenance) && (
                  <p className="detail-note">
                    Detail highlight belum tersedia untuk hasil lama ini. Bukti asli tetap tersedia
                    pada log dan hasil tersimpan.
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
        {visibleTab === 'workflow' && (
          <>
            <div className="section-label">
              <span>ALUR PENALARAN</span>
              <span>{run ? statusLabels[run.status] : 'Siap dijalankan'}</span>
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
                        aria-expanded={expanded === i}
                        onClick={() => {
                          setExpanded(expanded === i ? null : i);
                          setProofMode('stage');
                        }}
                      >
                        <div>
                          <span className="primitive">{step.primitive}</span>
                          <h4>{step.title}</h4>
                          <p>
                            {run && !run.rubric
                              ? descriptions[i]
                              : definition?.steps.find((entry) => entry.id === step.id)
                                  ?.description}
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
                          {i === 0 && context && (
                            <>
                              <div className="source-grid">
                                {Object.entries(context.source_counts).map(([key, count]) => (
                                  <div key={key}>
                                    <strong>{count.toLocaleString('id-ID')}</strong>
                                    <span>{sourceNames[key] || key}</span>
                                  </div>
                                ))}
                              </div>
                              <p className="detail-note">
                                Sumber: data/dataset_kasirnusa · Snapshot 1 Oktober 2026. Transaksi
                                harian diagregasikan oleh kode.
                              </p>
                              {context.warnings.length > 0 && (
                                <details>
                                  <summary>{context.warnings.length} catatan kualitas data</summary>
                                  <ul>
                                    {context.warnings.map((x, n) => (
                                      <li key={n}>{x}</li>
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
                                  <span>{classNames[a.choice] || a.choice}</span>
                                  <small>Confidence {Math.round(a.confidence * 100)}%</small>
                                </div>
                              ))}
                            </div>
                          )}
                          {!run?.rubric && i === 2 && step.data?.intent && (
                            <>
                              <strong className="intent-label">{step.data.label}</strong>
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
                                  Nilai Noul: kemungkinan bukti menyatakan syarat eksplisit sebelum
                                  ekspansi. Bukan label penghambat otomatis.
                                </p>
                                <div className="answer-list">
                                  {step.data.tickets.map((a: RecordData) => (
                                    <div key={a.ticket_id}>
                                      <Evidence id={a.ticket_id} onClick={onEvidence} />
                                      <span>Noul</span>
                                      <strong>{a.noul.toFixed(3)}</strong>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          {step.id === 'result' && calc && (
                            <div className="calculation">
                              <span>PERHITUNGAN KODE</span>
                              <strong>
                                {calc.formula || 'Jumlah tambahan belum dapat dipastikan'}
                              </strong>
                              <p>{result?.action_label}</p>
                              {result?.action && (
                                <details>
                                  <summary>Detail penilaian tindak lanjut</summary>
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
                          {step.data?.note && <p>{step.data.note}</p>}
                          {i > 0 && !step.data && (
                            <p className="detail-note">
                              Belum dievaluasi. Hasil muncul setelah tahap ini diproses.
                            </p>
                          )}
                          {calls.length > 0 && (
                            <details className="request-log">
                              <summary>
                                {calls.length} panggilan Jev · pertanyaan, input & respons
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
                                    <summary>State yang dikirim</summary>
                                    <pre>{JSON.stringify(call.state, null, 2)}</pre>
                                  </details>
                                  <details>
                                    <summary>Respons asli Jev</summary>
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
              <ShieldCheck size={14} /> Confidence adalah kepastian penilaian model, bukan
              probabilitas deal menang.
            </div>
            {result && (
              <button
                className="primary full"
                onClick={() => {
                  setTab('results');
                  setProofMode('support');
                }}
              >
                Buka hasil analisis <ArrowRight size={15} />
              </button>
            )}
          </>
        )}
        {visibleTab === 'sources' && <SourceView context={context} onEvidence={onEvidence} />}
        {visibleTab === 'results' && result && calc && run && (
          <section className="analysis-result">
            <div className="result-heading">
              <span className="eyebrow">HASIL ANALISIS</span>
              <h3>{result.title}</h3>
              <p>{result.intent_label || 'Tidak ada penilaian niat yang cukup jelas.'}</p>
            </div>
            <ResultGuidance run={run} onStage={showReviewStage} />
            <h4>Estimasi nilai</h4>
            <div className="value-grid">
              <div>
                <span>Tambahan outlet</span>
                <strong>{calc.additional_outlets ?? '—'}</strong>
              </div>
              <div>
                <span>Existing → target</span>
                <strong>
                  {calc.current_outlets} → {calc.target_outlets ?? '—'}
                </strong>
              </div>
              <div>
                <span>Tambahan annualized bruto</span>
                <strong>{money(calc.gross_annual)}</strong>
              </div>
              <div>
                <span>Neto · skenario diskon tetap</span>
                <strong>{money(calc.net_annual_scenario)}</strong>
              </div>
            </div>
            <p className="detail-note">
              {calc.formula || 'Angka belum dapat dipastikan dari bukti tersedia.'}
            </p>
            {calc.exceeds_package && (
              <div className="notice warning">
                Target melebihi batas paket saat ini. Diskusikan upgrade; harga premium belum
                dihitung.
              </div>
            )}
            <h4>Asumsi & hal yang perlu dikonfirmasi</h4>
            <ul>
              {[...calc.assumptions, ...result.concerns].map((x: string, i: number) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            {run.rubric && (
              <section aria-label="Evaluasi rubrik">
                <h4>Evaluasi rubrik · 19 pertanyaan</h4>
                {(definition?.steps || [])
                  .filter((group) => evaluations(group.id).length)
                  .map((group) => (
                    <details key={group.id}>
                      <summary>{group.title}</summary>
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
                Hasil rubrik lama. Pertanyaan v2 belum dievaluasi pada hasil ini.
              </p>
            )}
            <h4>Bukti dan detail teknis</h4>{' '}
            {run && (
              <>
                <div className="proof-controls">
                  <button
                    aria-pressed={supporting}
                    onClick={() => setProofMode('support')}
                    disabled={!result}
                  >
                    Bukti pendukung hasil
                  </button>
                  <button
                    aria-pressed={proofMode === 'all'}
                    onClick={() => setProofMode('all')}
                    disabled={!result}
                  >
                    Semua data yang dievaluasi
                  </button>
                </div>
                {!run.steps.some((step) => step.provenance) && (
                  <p className="detail-note">
                    Detail highlight belum tersedia untuk hasil lama ini. Bukti asli tetap tersedia
                    pada log dan hasil tersimpan.
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
            <h4>Jalur bukti</h4>
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
                  Preseden pembanding · {result.precedents.length} keputusan akun lain
                </summary>
                <p className="detail-note">
                  Dikirim sebagai konteks pembanding, bukan approval untuk akun ini.
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
            <div className="export-row">
              <a href={`/api/expansion-runs/${run.id}/export/md`} download>
                <Download size={14} /> Ringkasan Markdown
              </a>
              <a href={`/api/expansion-runs/${run.id}/export/csv`} download>
                <Download size={14} /> Peluang CSV
              </a>
            </div>
            <details className="metadata">
              <summary>Metadata evaluasi</summary>
              <p>
                Gateway: {run.gateway || 'typesafe'}
                <br />
                Model: {run.models.join(', ') || run.model}
                <br />
                Rubrik: {run.rubric_version}
                <br />
                Evaluasi: {dateTime(run.created_at)}
                <br />
                Hash dataset: {run.dataset_hash}
              </p>
            </details>
          </section>
        )}
      </div>
      <DeleteRunDialog
        target={deleteTarget}
        account={`${account.id} · ${account.label}`}
        busy={deleting}
        error={deleteError}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={removeRun}
      />
    </aside>
  );
}
function Evidence({ id, onClick }: { id: string; onClick: (id: string) => void }) {
  return (
    <button className="evidence-link" onClick={() => onClick(id)}>
      {id}
      <ExternalLink size={10} />
    </button>
  );
}
function Distribution({ answer }: { answer: RecordData }) {
  return (
    <div className="distribution">
      <div className="distribution-meta">
        <span>
          {answer.type === 'score'
            ? `Score ${answer.score.toFixed(2)}`
            : `Choice: ${answer.choice}`}
        </span>
        <span>Confidence {Math.round(answer.confidence * 100)}%</span>
      </div>
      {Object.entries(answer.probabilities as Record<string, number>).map(([key, probability]) => (
        <div className="probability" key={key}>
          <span>{answer.legend?.[key] || key}</span>
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
  if (!c) return <p>Memuat data sumber…</p>;
  const max = Math.max(...c.usage.map((x) => x.transactions), 1);
  return (
    <section className="source-view">
      <h3>Fakta dari data sumber</h3>
      <p className="detail-note">
        Bagian ini tersedia sebelum Jev dijalankan. Belum merupakan penilaian model.
      </p>
      <h4>Kontrak & stakeholder</h4>
      {c.contracts.map((r) => (
        <div className="source-card" key={r.contract_id}>
          <Evidence id={r.contract_id} onClick={onEvidence} />
          <strong>
            {r.paket} · {r.outlet_kontrak} outlet · batas {r.batas_outlet_paket}
          </strong>
          <p>
            {money(Number(r.harga_per_outlet_bulan))}/outlet/bulan · diskon {r.diskon_pct}%
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
      <h4>Transaksi server per bulan</h4>
      <div className="usage-chart">
        {c.usage.map((r) => (
          <div
            key={r.month}
            title={`${r.month}: ${r.transactions.toLocaleString('id-ID')} transaksi; ${r.records} outlet-hari`}
          >
            <i style={{ height: `${Math.max((r.transactions / max) * 100, 2)}%` }} />
            <small>{r.month.slice(5)}</small>
          </div>
        ))}
      </div>
      <p className="detail-note">
        Transaksi yang tercatat server; tidak ditambah transaksi offline. Periksa versi dan
        sinkronisasi sebelum menyimpulkan tren bisnis.
      </p>
      <h4>Email & catatan meeting · {c.interactions.length}</h4>
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
            <span className="unanswered">Belum ada balasan tercatat</span>
          )}
        </div>
      ))}
      <h4>Tiket support · {c.tickets.length}</h4>
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
      <h4>Pipeline & keputusan akun</h4>
      <p>
        {c.deals.length} deal dan {c.decisions.length} keputusan khusus akun tercatat. Record yang
        tidak ada tidak dibuat oleh aplikasi.
      </p>
      <h4>Kandidat jalur pipeline</h4>
      {c.pipeline_candidates?.length ? (
        c.pipeline_candidates.map((item, i) => (
          <div className="source-card" key={i}>
            <strong>{item.label}</strong>
            <div className="evidence-chips">
              {item.path.map((id: string) => (
                <Evidence key={id} id={id} onClick={onEvidence} />
              ))}
            </div>
            <p>
              Kandidat berbasis record. Relevansi dan kecukupan tindak lanjut dinilai pada
              PC-1–PC-3.
            </p>
          </div>
        ))
      ) : (
        <p>Belum ditemukan jalur pipeline yang didukung ID atau record sumber untuk akun ini.</p>
      )}
    </section>
  );
}
