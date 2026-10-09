import { t, tx, useLanguage } from './i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  Crosshair,
  Database,
  FileText,
  GitBranch,
  Layers,
  LockKeyhole,
  Mail,
  Network,
  Moon,
  Sun,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import { api, type Context, type Evidence, type GraphData, type GraphItem } from './types';
import WorkflowPanel from './WorkflowPanel';
import GlobalSearch, { type SearchHit } from './GlobalSearch';
import ReportPage from './ReportPage';
import PanelDivider from './PanelDivider';
import { useTheme } from './theme';
import { usePresence, useReducedMotion } from './motion';
const colors: Record<string, string> = {
  account: 'var(--node-account)',
  employee: 'var(--node-employee)',
  contact: 'var(--node-contact)',
  interaction: 'var(--node-interaction)',
  contract: 'var(--node-contract)',
  ticket: 'var(--node-ticket)',
  decision: 'var(--node-decision)',
  feature: '#71cbb2',
  bug: '#ee8fa5',
  release: '#8dabe3',
  usage: '#70c0df',
  deal: '#ddaf68',
};
const names: Record<string, string> = {
  account: 'Akun',
  employee: 'Owner',
  contact: 'Kontak',
  interaction: 'Interaksi',
  contract: 'Kontrak',
  ticket: 'Tiket',
  decision: 'Keputusan',
  feature: 'Fitur',
  bug: 'Bug',
  release: 'Rilis',
  usage: 'Usage',
  deal: 'Deal',
};
const icons: Record<string, typeof Building2> = {
  account: Building2,
  employee: Users,
  contact: Users,
  interaction: Mail,
  contract: FileText,
  ticket: Ticket,
  decision: GitBranch,
  feature: Layers,
  usage: Activity,
};
type EntityNode = Node<
  {
    entity: GraphItem;
    highlighted: boolean;
    selected: boolean;
    dimmed: boolean;
    proofRole?: string;
  },
  'entity'
>;
function Entity({ data }: NodeProps<EntityNode>) {
  useLanguage();
  const e = data.entity,
    Icon = icons[e.kind] || Database;
  const special = e.id === 'C02' || e.id === 'C06';
  return (
    <div
      className={`entity ${e.kind} ${data.selected ? 'chosen' : ''} ${data.highlighted ? 'highlighted' : ''} ${data.dimmed ? 'dimmed' : ''} ${data.proofRole ? `proof-node-${data.proofRole}` : ''}`}
      data-proof-role={data.proofRole}
      style={{ '--node-color': colors[e.kind] } as React.CSSProperties}
      data-testid={`entity-${e.id}`}
    >
      <Handle type="target" position={Position.Left} />
      {data.proofRole && (
        <span className="proof-node-badge">
          {data.proofRole === 'expansion'
            ? t('Bukti ekspansi')
            : data.proofRole === 'calculation'
              ? t('Dasar perhitungan')
              : t('Konteks diperiksa')}
        </span>
      )}
      <div className="entity-top">
        <span>
          <Icon size={13} /> {e.kind === 'account' ? e.id : tx(names[e.kind])}
        </span>
        {special && <span className="focus-dot" />}
      </div>
      <strong>{['usage', 'release'].includes(e.kind) ? tx(e.label) : e.label}</strong>
      <small>
        {e.kind === 'account'
          ? t('{0} · {1} outlet', [e.record.paket || 'Prospek', e.record.jumlah_outlet])
          : e.id}
      </small>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { entity: Entity };
const locked = [
  'Churn Early Warning Graph',
  'Decision Maker Discovery',
  'Relationship Path Finder',
  'Deal Acceleration',
];
function positions(
  graph: GraphData,
  focused: string | null,
): Record<string, { x: number; y: number }> {
  const points: Record<string, { x: number; y: number }> = {};
  if (focused) {
    points[focused] = { x: 20, y: 330 };
    const groups = [
      'employee',
      'contact',
      'account',
      'contract',
      'interaction',
      'ticket',
      'feature',
      'usage',
      'release',
      'bug',
      'deal',
      'decision',
    ];
    let col = 0;
    groups.forEach((kind) => {
      const items = graph.nodes.filter((n) => n.kind === kind && n.id !== focused);
      if (!items.length) return;
      items.forEach((n, i) => {
        points[n.id] = { x: 330 + col * 280 + Math.floor(i / 12) * 240, y: (i % 12) * 112 };
      });
      col += Math.ceil(items.length / 12);
    });
  } else {
    const owners = graph.nodes.filter((n) => n.kind === 'employee');
    owners.forEach((owner, oi) => {
      const base = { x: (oi % 3) * 1170, y: Math.floor(oi / 3) * 1030 };
      points[owner.id] = { x: base.x + 420, y: base.y + 420 };
      graph.nodes
        .filter((n) => n.kind === 'account' && n.record.account_owner_id === owner.id)
        .forEach((n, i, arr) => {
          const angle = (i / arr.length) * Math.PI * 2;
          points[n.id] = {
            x: base.x + 420 + Math.cos(angle) * 420,
            y: base.y + 420 + Math.sin(angle) * 380,
          };
        });
    });
  }
  return points;
}
export default function App() {
  const { language, setLanguage } = useLanguage();
  const { theme, toggle } = useTheme();
  const [base, setBase] = useState<GraphData | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [detail, setDetail] = useState<GraphData | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [contextError, setContextError] = useState('');
  const [panel, setPanel] = useState(false);
  const [menu, setMenu] = useState<{ entity: GraphItem; x: number; y: number } | null>(null);
  const [inspected, setInspected] = useState<GraphItem | null>(null);
  const [page, setPage] = useState<'graph' | 'report'>('graph');
  const [reportRunId, setReportRunId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [ratio, setRatio] = useState(() => {
    const value = Number(localStorage.getItem('evaly-panel-ratio'));
    return value > 0 && value <= 60 ? value : 100 / 3;
  });
  const searchTarget = useRef<SearchHit | null>(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [highlight, setHighlight] = useState('');
  const [proof, setProof] = useState<Evidence[]>([]);
  const updateProof = useCallback((items: Evidence[]) => {
    setProof(items);
    if (!items.length) {
      setHighlight('');
      setInspected(null);
    }
  }, []);
  const [jev, setJev] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const graphWrap = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const flow = useReactFlow();
  const reducedMotion = useReducedMotion();
  const cameraDuration = reducedMotion ? 0 : 300;
  const panelPresence = usePresence(panel ? true : null, 250, focused);
  const menuPresence = usePresence(menu, 150, focused);
  const evidencePresence = usePresence(inspected, 200, focused);
  const visibleMenu = menuPresence.value;
  const visibleEvidence = evidencePresence.value;
  const selectAccount = (id: string | null) => {
    if (id !== focused) {
      setDetail(null);
      setContext(null);
      setContextError('');
      setError('');
      setProof([]);
      setHighlight('');
      setInspected(null);
    }
    setFocused(id);
  };
  useEffect(() => {
    api<GraphData>('/graph')
      .then(setBase)
      .catch((e) => setError(e.message));
    api<{ jev_configured: boolean }>('/health')
      .then((x) => setJev(x.jev_configured))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!focused) return;
    let live = true;
    Promise.all([
      api<GraphData>(`/graph?account_id=${focused}`),
      api<Context>(`/accounts/${focused}/context`).catch((e) => {
        if (live) setContextError(e.message);
        throw e;
      }),
    ])
      .then(([g, c]) => {
        if (live) {
          setDetail(g);
          setContext(c);
          setLoaded((v) => v + 1);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [focused]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(null);
        setInspected(null);
      }
    };
    const outside = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as HTMLElement)) setMenu(null);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  const graph = focused && detail ? detail : base;
  const filtered = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const p = positions(graph, focused && detail ? focused : null);
    const proofNodes = new Map(
      proof.filter((item) => item.node_id).map((item) => [item.node_id!, item.role]),
    );
    if (proof.length && focused) proofNodes.set(focused, 'context');
    const nodes: EntityNode[] = graph.nodes
      .filter((n) => {
        if (focused && detail) return true;
        return n.kind !== 'account' || filter === 'all' || n.record.tipe === filter;
      })
      .map((n) => ({
        id: n.id,
        type: 'entity',
        position: p[n.id] || { x: 0, y: 0 },
        data: {
          entity: n,
          selected: n.id === focused,
          highlighted: n.id === highlight,
          dimmed: proof.length > 0 && !proofNodes.has(n.id),
          proofRole: proofNodes.get(n.id),
        },
        draggable: false,
      }));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        ...e,
        type: 'default',
        label: focused && detail ? tx(e.label, language).replaceAll('_', ' ') : undefined,
        style: {
          stroke:
            proofNodes.has(e.source) && proofNodes.has(e.target)
              ? {
                  expansion: 'var(--evidence-expansion)',
                  calculation: 'var(--evidence-calculation)',
                  context: 'var(--evidence-context)',
                }[proofNodes.get(e.target)!]
              : 'var(--graph-edge)',
          opacity:
            proof.length && !(proofNodes.has(e.source) && proofNodes.has(e.target)) ? 0.12 : 1,
          strokeWidth: proofNodes.has(e.source) && proofNodes.has(e.target) ? 2.5 : 1,
        },
        labelStyle: { fill: 'var(--muted)', fontSize: 9 },
        labelBgStyle: { fill: 'var(--surface)' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'var(--graph-edge)',
          width: 13,
          height: 13,
        },
      }));
    return { nodes, edges };
  }, [graph, focused, detail, filter, highlight, proof, language]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchTarget.current)
        flow.fitView({ padding: 0.15, duration: cameraDuration, maxZoom: focused ? 0.9 : 0.55 });
    }, 130);
    return () => clearTimeout(timer);
  }, [base, loaded, focused, filter, flow, cameraDuration]);
  const showEvidence = useCallback(
    (id: string) => {
      setHighlight(id);
      const liveItem = detail?.nodes.find((n) => n.id === id);
      const saved = proof.find((item) => item.id === id);
      const item = saved
        ? {
            id: saved.id,
            label: saved.label,
            source: t('{0} · snapshot evaluasi', [saved.source]),
            kind: liveItem?.kind || 'source',
            record: saved.record,
          }
        : liveItem;
      if (item) {
        setInspected(item);
        flow.fitView({
          nodes: liveItem ? [{ id }, { id: focused! }] : [{ id: focused! }],
          duration: cameraDuration,
          padding: 0.5,
          maxZoom: 1,
        });
      }
    },
    [detail, focused, flow, proof, cameraDuration],
  );
  const account = base?.nodes.find((n) => n.id === focused);
  useEffect(() => {
    const target = searchTarget.current;
    if (!target || !detail) return;
    const found = detail.nodes.find((node) => node.id === target.id);
    if (!found) return;
    setTimeout(() => {
      if (searchTarget.current !== target) return;
      setInspected(found);
      setHighlight(found.id);
      flow.fitView({
        nodes: [{ id: found.id }],
        duration: cameraDuration,
        padding: 0.5,
        maxZoom: 1,
      });
      searchTarget.current = null;
    }, 150);
  }, [detail, loaded, flow, cameraDuration]);
  return (
    <div className={`app ${panelPresence.value ? 'panel-open' : ''}`}>
      <div className="workspace">
        <header className="header">
          <div className="brand">
            <div className="p-1.5">
              <img
                src={theme === 'dark' ? '/evaly-logo-dark.svg' : '/evaly-logo.svg'}
                alt="Evaly"
                className="h-8 w-auto shrink-0 object-contain sm:h-10"
              />
            </div>
            <span className="header-divider" />
            <span>Evaluate Your Business Wisely</span>
          </div>
          <div className="header-right">
            <select
              className="language-select"
              aria-label={t('Bahasa')}
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'id' | 'en')}
            >
              <option value="id" lang="id">
                ID
              </option>
              <option value="en" lang="en">
                EN
              </option>
            </select>
            <nav aria-label={t('Navigasi utama')} className="main-nav">
              <button
                aria-current={page === 'graph' ? 'page' : undefined}
                onClick={() => setPage('graph')}
              >
                {t('Graph') + ' '}
              </button>
              <button
                aria-current={page === 'report' ? 'page' : undefined}
                onClick={() => {
                  setPage('report');
                  setMenu(null);
                  setInspected(null);
                }}
              >
                {t('Report') + ' '}
              </button>
            </nav>
            <button
              type="button"
              className="theme-toggle inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-brand"
              aria-label={theme === 'dark' ? t('Aktifkan mode terang') : t('Aktifkan mode gelap')}
              aria-pressed={theme === 'dark'}
              onClick={toggle}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span className="hidden sm:inline">
                {theme === 'dark' ? t('Terang') : t('Gelap')}
              </span>
            </button>
          </div>
        </header>
        {page === 'report' && (
          <ReportPage
            onOpen={(row) => {
              setPage('graph');
              selectAccount(row.account_id);
              setReportRunId(row.id);
              setPanel(true);
              setProof([]);
              setHighlight('');
            }}
            onDeleted={(id) => {
              if (reportRunId === id || activeRunId === id) {
                setReportRunId(null);
                setPanel(false);
                setProof([]);
                setHighlight('');
              }
            }}
          />
        )}
        <main
          className="main-area full-canvas"
          hidden={page !== 'graph'}
          style={{ '--panel-ratio': `${ratio}%` } as React.CSSProperties}
        >
          <section className="graph-card" aria-label={t('Context graph pelanggan')}>
            <div className="graph-toolbar">
              <div className="graph-title">
                <Network size={18} />
                <strong>{focused ? t('{0} · Konteks akun', [focused]) : 'Context graph'}</strong>
                <span className="count-pill">
                  {graph?.nodes.length ?? 0} {t('node')}
                </span>
              </div>
              <div className="toolbar-actions">
                {panelPresence.value && (
                  <button
                    className="reset-panel"
                    aria-label={t('Reset lebar sidebar')}
                    title={t('Kembali ke rasio graph 8 : sidebar 4')}
                    onClick={() => {
                      setRatio(100 / 3);
                      localStorage.setItem('evaly-panel-ratio', String(100 / 3));
                    }}
                  >
                    8:4
                  </button>
                )}
                {focused && (
                  <button
                    onClick={() => {
                      selectAccount(null);
                      setPanel(false);
                      setInspected(null);
                    }}
                  >
                    <ArrowLeft size={14} /> {t('Semua akun') + ' '}
                  </button>
                )}
                <button
                  title={t('Sesuaikan tampilan')}
                  aria-label={t('Sesuaikan tampilan')}
                  onClick={() => {
                    searchTarget.current = null;
                    setInspected(null);
                    flow.fitView({ padding: 0.15, duration: cameraDuration });
                  }}
                >
                  <Crosshair size={16} />
                </button>
              </div>
            </div>
            <div className="graph-filters">
              <GlobalSearch
                onSelect={(hit, aid) => {
                  if (!aid) return;
                  searchTarget.current = hit;
                  setPanel(false);
                  setReportRunId(null);
                  setMenu(null);
                  setFilter('all');
                  if (aid === focused && detail) {
                    const found = detail.nodes.find((node) => node.id === hit.id);
                    if (found) {
                      setInspected(found);
                      setHighlight(hit.id);
                      flow.fitView({
                        nodes: [{ id: hit.id }],
                        duration: cameraDuration,
                        padding: 0.5,
                        maxZoom: 1,
                      });
                      searchTarget.current = null;
                    }
                  } else selectAccount(aid);
                }}
              />
              <label className="filter-select">
                <select
                  aria-label={t('Filter tipe akun')}
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    selectAccount(null);
                    setPanel(false);
                  }}
                >
                  <option value="all">{t('Semua akun')}</option>
                  <option value="pelanggan">{t('Pelanggan')}</option>
                  <option value="prospek">{t('Prospek')}</option>
                </select>
                <ChevronDown size={13} />
              </label>
            </div>
            <div className="graph-canvas" ref={graphWrap}>
              <ReactFlow
                autoPanOnNodeFocus={false}
                colorMode={theme}
                nodes={filtered.nodes}
                edges={filtered.edges}
                nodeTypes={nodeTypes}
                minZoom={0.08}
                maxZoom={1.7}
                fitView
                nodesConnectable={false}
                onPaneClick={() => {
                  setMenu(null);
                  setInspected(null);
                }}
                onNodeClick={(event, node) => {
                  const item = (node.data as EntityNode['data']).entity;
                  if (item.kind !== 'account') {
                    setInspected(item);
                    setHighlight(item.id);
                    return;
                  }
                  const rect = graphWrap.current!.getBoundingClientRect();
                  setMenu({
                    entity: item,
                    x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - 320)),
                    y: Math.max(8, Math.min(event.clientY - rect.top, rect.height - 365)),
                  });
                  if (item.id !== focused) {
                    setPanel(false);
                    selectAccount(item.id);
                  }
                }}
              >
                <Background
                  color="var(--graph-dot)"
                  gap={22}
                  size={1}
                  variant={BackgroundVariant.Dots}
                />
                <Controls showInteractive={false} position="bottom-right" />
              </ReactFlow>
              {!base && !error && (
                <div className="canvas-loading">
                  <span className="spinner" />
                  {t('Menghubungkan seluruh sumber data…') + ' '}
                </div>
              )}
              {error && (
                <div className="canvas-error">
                  {tx(error)}
                  <button onClick={() => window.location.reload()}>{t('Muat ulang')}</button>
                </div>
              )}
              {visibleMenu && (
                <div
                  ref={menuRef}
                  className={`floating-menu ${menuPresence.exiting ? 'motion-exit' : 'motion-enter'}`}
                  inert={menuPresence.exiting}
                  style={{ left: visibleMenu.x, top: visibleMenu.y }}
                  role="menu"
                  aria-label={t('Pilihan analisis akun')}
                >
                  <div className="menu-heading">
                    <span className="eyebrow">{t('PILIH ANALISIS')}</span>
                    <strong>
                      {visibleMenu.entity.id} · {visibleMenu.entity.label}
                    </strong>
                  </div>
                  {locked.map((label, i) => (
                    <button key={label} role="menuitem" disabled>
                      <span className="menu-number">0{i + 1}</span>
                      <span>
                        {label}
                        <small>{t('Belum tersedia')}</small>
                      </span>
                      <LockKeyhole size={13} />
                    </button>
                  ))}
                  <button
                    role="menuitem"
                    className="expansion-option"
                    disabled={visibleMenu.entity.record.tipe !== 'pelanggan'}
                    onClick={() => {
                      setReportRunId(null);
                      setPanel(true);
                      setMenu(null);
                    }}
                  >
                    <span className="menu-number">05</span>
                    <span>
                      Account Expansion
                      <small>
                        {visibleMenu.entity.record.tipe === 'pelanggan'
                          ? t('Temukan peluang pertumbuhan')
                          : t('Analisis ini untuk pelanggan existing')}
                      </small>
                    </span>
                    {visibleMenu.entity.record.tipe === 'pelanggan' ? (
                      <ArrowRight size={16} />
                    ) : (
                      <LockKeyhole size={13} />
                    )}
                  </button>
                </div>
              )}
              {visibleEvidence && (
                <div
                  className={`evidence-popover ${evidencePresence.exiting ? 'motion-exit' : 'motion-enter'}`}
                  inert={evidencePresence.exiting}
                >
                  <button
                    className="close-icon"
                    aria-label={t('Tutup bukti')}
                    onClick={() => setInspected(null)}
                  >
                    <X size={16} />
                  </button>
                  <span className="eyebrow">
                    {t('BUKTI SUMBER ·') + ' '}
                    {visibleEvidence.id}
                  </span>
                  <h3>{visibleEvidence.label}</h3>
                  <small className="source-name">{tx(visibleEvidence.source)}</small>
                  <dl>
                    {Object.entries(visibleEvidence.record)
                      .filter(([, value]) => value !== '' && value != null)
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt>{key.replaceAll('_', ' ')}</dt>
                          <dd>
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </div>
              )}
              {!focused && (
                <div className="graph-hint">
                  <span className="hint-symbol">
                    <Building2 size={18} />
                  </span>
                  <div>
                    <strong>{t('Mulai dari satu pelanggan')}</strong>
                    <p>{t('Klik node akun untuk menjelajahi konteks dan analisisnya.')}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="graph-footer">
              <div className="legend">
                {(focused
                  ? ['account', 'contact', 'interaction', 'contract', 'ticket', 'decision']
                  : ['account', 'employee']
                ).map((kind) => (
                  <span key={kind}>
                    <i style={{ background: colors[kind] }} />
                    {tx(names[kind])}
                  </span>
                ))}
              </div>
            </div>
          </section>
          {panelPresence.value && focused && account && (
            <PanelDivider ratio={ratio} onChange={setRatio} />
          )}
          {panelPresence.value && focused && account && (
            <WorkflowPanel
              key={`${focused}:${reportRunId || 'new'}`}
              initialRunId={reportRunId}
              onRunChange={setActiveRunId}
              exiting={panelPresence.exiting}
              account={account}
              context={context}
              contextError={tx(contextError)}
              jevConfigured={jev}
              onClose={() => {
                setPanel(false);
                setInspected(null);
                document
                  .querySelector<HTMLElement>(`[data-testid="entity-${focused}"]`)
                  ?.closest<HTMLElement>('[tabindex]')
                  ?.focus({ preventScroll: true });
                setProof([]);
                setHighlight('');
              }}
              onEvidence={showEvidence}
              onEvidenceSet={updateProof}
              onFocusEvidence={() => {
                const ids = new Set(proof.map((item) => item.node_id));
                ids.add(focused);
                flow.fitView({
                  nodes: (detail?.nodes || [])
                    .filter((item) => ids.has(item.id))
                    .map((item) => ({ id: item.id })),
                  padding: 0.2,
                  duration: cameraDuration,
                });
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
