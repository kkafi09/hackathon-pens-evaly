// Source records differ by entity; the API envelopes remain explicitly typed.
export type RecordData = Record<string, any>;
export type Evidence = {
  id: string;
  node_id: string | null;
  source: string;
  label: string;
  record: RecordData;
  role: 'context' | 'expansion' | 'calculation';
  question_refs: string[];
  quote?: string;
  fields?: string[];
  assessments?: RecordData;
};
export type GraphItem = {
  id: string;
  kind: string;
  label: string;
  record: RecordData;
  source: string;
};
export type GraphData = {
  nodes: GraphItem[];
  edges: {
    id: string;
    source: string;
    target: string;
    label: string;
    evidence: unknown;
    inference: boolean;
  }[];
  pipeline: RecordData[];
  pipeline_value: number;
  counts: { customers: number; prospects: number; outlets: number };
};
export type Context = {
  account: RecordData;
  owner: RecordData;
  contacts: RecordData[];
  interactions: RecordData[];
  tickets: RecordData[];
  contracts: RecordData[];
  deals: RecordData[];
  decisions: RecordData[];
  usage: RecordData[];
  features: RecordData[];
  source_counts: Record<string, number>;
  warnings: string[];
  dataset_hash: string;
};
export type RunStatus = 'waiting' | 'running' | 'done' | 'review' | 'failed' | 'skipped';
export type ReviewReason = {
  code: string;
  stage: string;
  title: string;
  message: string;
  confidence?: number;
  threshold?: number;
  source_ids: string[];
};
export type NextStep = {
  action: string;
  owner: string;
  confirmations: string[];
  expected_outcome: string;
};
export type Run = {
  review_reasons?: ReviewReason[];
  next_steps?: NextStep[];
  gateway?: string;
  requested_model?: string;
  id: string;
  account_id: string;
  account_name?: string;
  created_at: string;
  finished_at?: string;
  status: RunStatus;
  model: string | null;
  models: string[];
  stale?: boolean;
  error: string | null;
  dataset_hash: string;
  rubric_version: string;
  result: RecordData | null;
  steps: {
    id: string;
    title: string;
    primitive: string;
    status: RunStatus;
    data: RecordData | null;
    question_count?: number;
    provenance?: Evidence[];
  }[];
  calls: {
    stage: string;
    at: string;
    questions: RecordData;
    state: RecordData;
    source_ids: string[];
    response: RecordData;
  }[];
};
export type History = Pick<
  Run,
  'gateway' | 'id' | 'created_at' | 'status' | 'model' | 'stale' | 'dataset_hash' | 'rubric_version'
>;

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Server tidak tersedia (HTTP ${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export const money = (value: number | null | undefined) =>
  value == null
    ? 'Belum dihitung'
    : new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(value);
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
export const statusLabels: Record<RunStatus, string> = {
  waiting: 'Menunggu',
  running: 'Berjalan',
  done: 'Selesai',
  review: 'Perlu ditinjau',
  failed: 'Gagal',
  skipped: 'Dilewati',
};
