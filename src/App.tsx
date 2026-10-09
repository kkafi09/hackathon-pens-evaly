import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
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
  ArrowUpRight,
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
  Search,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import { api, money, type Context, type Evidence, type GraphData, type GraphItem } from './types';
import WorkflowPanel from './WorkflowPanel';
import { useTheme } from './theme';
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
            ? 'Bukti ekspansi'
            : data.proofRole === 'calculation'
              ? 'Dasar perhitungan'
              : 'Konteks diperiksa'}
        </span>
      )}
      <div className="entity-top">
        <span>
          <Icon size={13} /> {e.kind === 'account' ? e.id : names[e.kind]}
        </span>
        {special && <span className="focus-dot" />}
      </div>
      <strong>{e.label}</strong>
      <small>
        {e.kind === 'account'
          ? `${e.record.paket || 'Prospek'} · ${e.record.jumlah_outlet} outlet`
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
      const items = graph.nodes.filter((n) => n.kind === kind);
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
  const { theme, toggle } = useTheme();
  const [base, setBase] = useState<GraphData | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [detail, setDetail] = useState<GraphData | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [panel, setPanel] = useState(false);
  const [menu, setMenu] = useState<{ entity: GraphItem; x: number; y: number } | null>(null);
  const [inspected, setInspected] = useState<GraphItem | null>(null);
  const [search, setSearch] = useState('');
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
  const selectAccount = (id: string | null) => {
    if (id !== focused) {
      setDetail(null);
      setContext(null);
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
      api<Context>(`/accounts/${focused}/context`),
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
        return (
          n.kind !== 'account' ||
          ((filter === 'all' || n.record.tipe === filter) &&
            (!search || `${n.id} ${n.label}`.toLowerCase().includes(search.toLowerCase())))
        );
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
        label: focused && detail ? e.label.replaceAll('_', ' ') : undefined,
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
  }, [graph, focused, detail, filter, search, highlight, proof]);
  useEffect(() => {
    const timer = setTimeout(() => {
      flow.fitView({ padding: 0.15, duration: 400, maxZoom: focused ? 0.9 : 0.55 });
    }, 130);
    return () => clearTimeout(timer);
  }, [base, loaded, focused, filter, search, flow]);
  const choose = (id: string) => {
    setPanel(false);
    setInspected(null);
    setHighlight('');
    selectAccount(id || null);
    setMenu(null);
  };
  const showEvidence = useCallback(
    (id: string) => {
      setHighlight(id);
      const liveItem = detail?.nodes.find((n) => n.id === id);
      const saved = proof.find((item) => item.id === id);
      const item = saved
        ? {
            id: saved.id,
            label: saved.label,
            source: `${saved.source} · snapshot evaluasi`,
            kind: liveItem?.kind || 'source',
            record: saved.record,
          }
        : liveItem;
      if (item) {
        setInspected(item);
        flow.fitView({
          nodes: liveItem ? [{ id }, { id: focused! }] : [{ id: focused! }],
          duration: 500,
          padding: 0.5,
          maxZoom: 1,
        });
      }
    },
    [detail, focused, flow, proof],
  );
  const account = base?.nodes.find((n) => n.id === focused);
  const searchHits =
    base?.nodes
      .filter(
        (n) =>
          n.kind === 'account' && `${n.id} ${n.label}`.toLowerCase().includes(search.toLowerCase()),
      )
      .slice(0, 6) || [];
  return (
    <div className={`app ${panel ? 'panel-open' : ''}`}>
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
            <span>Intelligence workspace</span>
          </div>
          <div className="header-right">
            <button
              type="button"
              className="theme-toggle inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-brand"
              aria-label={theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
              aria-pressed={theme === 'dark'}
              onClick={toggle}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Terang' : 'Gelap'}</span>
            </button>
            <span className="avatar small">EV</span>
          </div>
        </header>
        <section className="page-heading">
          <div>
            <div className="eyebrow">
              CUSTOMER INTELLIGENCE <span>/</span> CONTEXT GRAPH
            </div>
            <h1>
              Setiap koneksi, sebuah peluang<span>.</span>
            </h1>
            <p>Jelajahi hubungan pelanggan. Temukan konteks di balik pertumbuhan.</p>
          </div>
        </section>
        <div className="metrics">
          <Metric icon={Building2} value={base?.counts.customers ?? '—'} label="Pelanggan aktif" />
          <Metric icon={Crosshair} value={base?.counts.prospects ?? '—'} label="Prospek" />
          <Metric icon={Layers} value={base?.counts.outlets ?? '—'} label="Outlet terhubung" />
          <div className="metric pipeline">
            <span className="metric-icon">
              <GitBranch size={18} />
            </span>
            <div>
              <strong>
                {base ? money(base.pipeline_value) : '—'}
                <small>/ tahun</small>
              </strong>
              <span>Pipeline pelanggan baru · terpisah dari ekspansi</span>
            </div>
          </div>
        </div>
        <main className="main-area">
          <section className="graph-card" aria-label="Context graph pelanggan">
            <div className="graph-toolbar">
              <div className="graph-title">
                <Network size={18} />
                <strong>{focused ? `${focused} · Konteks akun` : 'Context graph'}</strong>
                <span className="count-pill">{graph?.nodes.length ?? 0} node</span>
              </div>
              <div className="toolbar-actions">
                {focused && (
                  <button
                    onClick={() => {
                      selectAccount(null);
                      setPanel(false);
                      setInspected(null);
                    }}
                  >
                    <ArrowLeft size={14} /> Semua akun
                  </button>
                )}
                <button
                  title="Sesuaikan tampilan"
                  aria-label="Sesuaikan tampilan"
                  onClick={() => flow.fitView({ padding: 0.15, duration: 300 })}
                >
                  <Crosshair size={16} />
                </button>
              </div>
            </div>
            <div className="graph-filters">
              <div className="search">
                <Search size={15} />
                <input
                  aria-label="Cari akun"
                  placeholder="Cari nama atau ID akun…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <div className="search-results">
                    {searchHits.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          choose(n.id);
                          setSearch('');
                        }}
                      >
                        <span>{n.id}</span>
                        {n.label}
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                    {!searchHits.length && <p>Akun tidak ditemukan</p>}
                  </div>
                )}
              </div>
              <label className="filter-select">
                <select
                  aria-label="Filter tipe akun"
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    selectAccount(null);
                    setPanel(false);
                  }}
                >
                  <option value="all">Semua akun</option>
                  <option value="pelanggan">Pelanggan</option>
                  <option value="prospek">Prospek</option>
                </select>
                <ChevronDown size={13} />
              </label>
            </div>
            <div className="graph-canvas" ref={graphWrap}>
              <ReactFlow
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
                <MiniMap
                  position="bottom-right"
                  nodeColor={(node) => colors[(node.data as EntityNode['data']).entity.kind]}
                  maskColor="var(--graph-mask)"
                  pannable
                  zoomable
                />
              </ReactFlow>
              {!base && !error && (
                <div className="canvas-loading">
                  <span className="spinner" />
                  Menghubungkan seluruh sumber data…
                </div>
              )}
              {error && (
                <div className="canvas-error">
                  {error}
                  <button onClick={() => window.location.reload()}>Muat ulang</button>
                </div>
              )}
              {menu && (
                <div
                  ref={menuRef}
                  className="floating-menu"
                  style={{ left: menu.x, top: menu.y }}
                  role="menu"
                  aria-label="Pilihan analisis akun"
                >
                  <div className="menu-heading">
                    <span className="eyebrow">PILIH ANALISIS</span>
                    <strong>
                      {menu.entity.id} · {menu.entity.label}
                    </strong>
                  </div>
                  {locked.map((label, i) => (
                    <button key={label} role="menuitem" disabled>
                      <span className="menu-number">0{i + 1}</span>
                      <span>
                        {label}
                        <small>Belum tersedia</small>
                      </span>
                      <LockKeyhole size={13} />
                    </button>
                  ))}
                  <button
                    role="menuitem"
                    className="expansion-option"
                    disabled={menu.entity.record.tipe !== 'pelanggan'}
                    onClick={() => {
                      setPanel(true);
                      setMenu(null);
                    }}
                  >
                    <span className="menu-number">05</span>
                    <span>
                      Account Expansion
                      <small>
                        {menu.entity.record.tipe === 'pelanggan'
                          ? 'Temukan peluang pertumbuhan'
                          : 'Analisis ini untuk pelanggan existing'}
                      </small>
                    </span>
                    {menu.entity.record.tipe === 'pelanggan' ? (
                      <ArrowRight size={16} />
                    ) : (
                      <LockKeyhole size={13} />
                    )}
                  </button>
                </div>
              )}
              {inspected && (
                <div className="evidence-popover">
                  <button
                    className="close-icon"
                    aria-label="Tutup bukti"
                    onClick={() => setInspected(null)}
                  >
                    <X size={16} />
                  </button>
                  <span className="eyebrow">BUKTI SUMBER · {inspected.id}</span>
                  <h3>{inspected.label}</h3>
                  <small className="source-name">{inspected.source}</small>
                  <dl>
                    {Object.entries(inspected.record)
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
                    <strong>Mulai dari satu pelanggan</strong>
                    <p>Klik node akun untuk menjelajahi konteks dan analisisnya.</p>
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
                    {names[kind]}
                  </span>
                ))}
              </div>
            </div>
          </section>
          {panel && focused && account && (
            <WorkflowPanel
              key={focused}
              account={account}
              context={context}
              jevConfigured={jev}
              onClose={() => {
                setPanel(false);
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
                  duration: 400,
                });
              }}
            />
          )}
        </main>
        <footer className="page-footer">
          <span>Evaly Context Intelligence</span>
        </footer>
      </div>
    </div>
  );
}
function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Building2;
  value: number | string;
  label: string;
}) {
  return (
    <div className="metric">
      <span className="metric-icon">
        <Icon size={18} />
      </span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
