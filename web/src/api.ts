export type Filter = {
  days: number;
  project: string;
  tool: string;
  q: string;
};

export const EMPTY_FILTER: Filter = { days: 30, project: '', tool: '', q: '' };

export type Summary = {
  commands: number;
  inputTokens: number;
  outputTokens: number;
  savedTokens: number;
  avgSavingsPct: number;
  weightedSavingsPct: number;
  totalTimeMs: number;
  avgTimeMs: number;
  projects: number;
  tools: number;
  firstSeen: string | null;
  lastSeen: string | null;
};

export type DayPoint = {
  day: string;
  commands: number;
  inputTokens: number;
  outputTokens: number;
  savedTokens: number;
  avgSavingsPct: number;
};

export type ProjectRow = {
  project: string;
  commands: number;
  inputTokens: number;
  savedTokens: number;
  avgSavingsPct: number;
  lastSeen: string;
};

export type ToolRow = {
  tool: string;
  commands: number;
  inputTokens: number;
  savedTokens: number;
  avgSavingsPct: number;
  avgTimeMs: number;
};

export type CommandRow = {
  id: number;
  timestamp: string;
  originalCmd: string;
  rtkCmd: string;
  inputTokens: number;
  outputTokens: number;
  savedTokens: number;
  savingsPct: number;
  execTimeMs: number;
  project: string;
  tool: string;
};

export type FailureRow = {
  id: number;
  timestamp: string;
  rawCommand: string;
  errorMessage: string;
  fallbackSucceeded: number;
};

export type Page<T> = { total: number; limit: number; offset: number; rows: T[] };

export type Facets = {
  projects: { project: string; commands: number }[];
  tools: { tool: string; commands: number }[];
};

export type Meta = {
  db: { path: string; exists: boolean; sizeBytes: number; mtimeMs: number };
  maxId: number;
};

export type CatalogCommand = {
  name: string;
  label: string;
  flags: string[];
  options: Record<string, string[]>;
};

export type Catalog = { readonly: boolean; bin: string; commands: CatalogCommand[] };

export type RunResult = {
  command: string;
  cwd: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  error: string | null;
};

export type ConfigFile = {
  name: string;
  path: string;
  exists: boolean;
  content: string;
  mtimeMs: number;
  backup?: string | null;
};

export type ConfigBundle = { dir: string; readonly: boolean; files: ConfigFile[] };

function qs(filter: Partial<Filter> & Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value === '' || value === undefined || value === null) continue;
    if (key === 'days' && !value) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
}

async function send<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

export const api = {
  meta: () => get<Meta>('/meta'),
  facets: () => get<Facets>('/facets'),
  summary: (f: Filter) => get<Summary>(`/summary${qs(f)}`),
  // Day buckets are computed server-side, so the server needs the viewer's
  // offset or evening commands land on the wrong day.
  timeseries: (f: Filter) =>
    get<DayPoint[]>(`/timeseries${qs({ ...f, tzOffset: new Date().getTimezoneOffset() })}`),
  projects: (f: Filter, limit = 20) => get<ProjectRow[]>(`/projects${qs({ ...f, limit })}`),
  tools: (f: Filter, limit = 20) => get<ToolRow[]>(`/tools${qs({ ...f, limit })}`),
  commands: (f: Filter, opts: { limit?: number; offset?: number; sort?: string; dir?: string } = {}) =>
    get<Page<CommandRow>>(`/commands${qs({ ...f, ...opts })}`),
  failures: (limit = 100, offset = 0) =>
    get<Page<FailureRow>>(`/failures${qs({ limit, offset })}`),
  catalog: () => get<Catalog>('/catalog'),
  run: (command: string, args: string[], cwd?: string) =>
    send<RunResult>('POST', '/run', { command, args, cwd }),
  config: () => get<ConfigBundle>('/config'),
  validateConfig: (content: string) =>
    send<{ valid: boolean; error?: string }>('POST', '/config/validate', { content }),
  saveConfig: (name: string, content: string) =>
    send<ConfigFile>('PUT', `/config/${name}`, { content }),
};
