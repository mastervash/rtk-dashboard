import { Fragment, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import type { Facets, Filter } from '../api';
import { api } from '../api';
import { useAsync } from '../hooks';
import { FilterBar } from '../components/FilterBar';
import { Badge, Button, Card, Empty, ErrorBox, Spinner, cx } from '../components/ui';
import { fullNumber, pct, relativeTime, shortPath, shortTime } from '../lib/format';

const PAGE = 50;

const COLUMNS: { key: string; label: string; sortable: boolean; className?: string }[] = [
  { key: 'timestamp', label: 'When', sortable: true, className: 'w-40' },
  { key: 'cmd', label: 'Command', sortable: false },
  { key: 'saved', label: 'Saved', sortable: true, className: 'w-24 text-right' },
  { key: 'pct', label: 'Rate', sortable: true, className: 'w-20 text-right' },
  { key: 'time', label: 'Time', sortable: true, className: 'w-20 text-right' },
];

export function History({
  filter,
  onFilterChange,
  facets,
  revision,
}: {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  facets: Facets | null;
  revision: number;
}) {
  const [tab, setTab] = useState<'commands' | 'failures'>('commands');
  const [sort, setSort] = useState('timestamp');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  const filterKey = `${filter.days}|${filter.project}|${filter.tool}|${filter.q}`;
  const page = useAsync(
    () => api.commands(filter, { limit: PAGE, offset, sort, dir }),
    [filterKey, sort, dir, offset, revision, tab]
  );
  const failures = useAsync(() => api.failures(200), [revision, tab]);

  // Any filter change invalidates the current page window.
  const [lastKey, setLastKey] = useState(filterKey);
  if (lastKey !== filterKey) {
    setLastKey(filterKey);
    setOffset(0);
  }

  function toggleSort(key: string) {
    if (sort === key) setDir(dir === 'desc' ? 'asc' : 'desc');
    else {
      setSort(key);
      setDir('desc');
    }
    setOffset(0);
  }

  const rows = page.data?.rows ?? [];
  const total = page.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar filter={filter} onChange={onFilterChange} facets={facets} showSearch />
        <div className="flex gap-1 rounded-md border border-line bg-panel p-0.5">
          {(['commands', 'failures'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                'rounded px-2.5 py-1 text-xs capitalize transition-colors',
                tab === t ? 'bg-panel-2 text-fg' : 'text-muted hover:text-fg'
              )}
            >
              {t === 'failures' && <TriangleAlert className="mr-1 inline size-3" />}
              {t === 'failures' ? 'Parse failures' : 'Commands'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'commands' ? (
        <Card
          title={`${fullNumber(total)} commands`}
          subtitle={filter.q ? `matching “${filter.q}”` : 'newest first'}
          bodyClassName="p-0"
          actions={
            <div className="flex items-center gap-1">
              <Button
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
                disabled={offset === 0}
                title="Previous page"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="tnum px-1 text-xs text-faint">
                {total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, total)}
              </span>
              <Button
                onClick={() => setOffset(offset + PAGE)}
                disabled={offset + PAGE >= total}
                title="Next page"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          }
        >
          {page.error && <div className="p-4"><ErrorBox error={page.error} /></div>}
          {page.loading && !page.data ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <Empty>No commands match these filters.</Empty>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-faint">
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={cx('px-4 py-2 font-normal', c.className)}>
                      {c.sortable ? (
                        <button
                          onClick={() => toggleSort(c.key)}
                          className={cx(
                            'inline-flex items-center gap-1 hover:text-fg',
                            sort === c.key && 'text-fg'
                          )}
                        >
                          {c.label}
                          {sort === c.key &&
                            (dir === 'desc' ? (
                              <ArrowDown className="size-3" />
                            ) : (
                              <ArrowUp className="size-3" />
                            ))}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      className="cursor-pointer transition-colors hover:bg-panel-2"
                    >
                      <td className="tnum px-4 py-2 whitespace-nowrap text-faint" title={r.timestamp}>
                        {shortTime(r.timestamp)}
                      </td>
                      <td className="max-w-0 px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Badge tone="info">{r.tool}</Badge>
                          <span className="truncate font-mono text-fg" title={r.originalCmd}>
                            {r.originalCmd}
                          </span>
                        </div>
                      </td>
                      <td
                        className={cx(
                          'tnum px-4 py-2 text-right',
                          r.savedTokens > 0 ? 'text-accent' : 'text-faint'
                        )}
                      >
                        {fullNumber(r.savedTokens)}
                      </td>
                      <td className="tnum px-4 py-2 text-right text-muted">{pct(r.savingsPct, 0)}</td>
                      <td className="tnum px-4 py-2 text-right text-faint">{r.execTimeMs}ms</td>
                    </tr>
                    {expanded === r.id && (
                      <tr className="bg-panel-2/60">
                        <td colSpan={COLUMNS.length} className="px-4 py-3">
                          <dl className="grid gap-2 font-mono text-[11px] sm:grid-cols-[6rem_1fr]">
                            <dt className="text-faint">original</dt>
                            <dd className="break-all text-muted">{r.originalCmd}</dd>
                            <dt className="text-faint">rewritten</dt>
                            <dd className="break-all text-accent">{r.rtkCmd}</dd>
                            <dt className="text-faint">project</dt>
                            <dd className="break-all text-muted">{r.project || '(unknown)'}</dd>
                            <dt className="text-faint">tokens</dt>
                            <dd className="text-muted">
                              {fullNumber(r.inputTokens)} in → {fullNumber(r.outputTokens)} out ={' '}
                              <span className="text-accent">{fullNumber(r.savedTokens)} saved</span>
                            </dd>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : (
        <Card
          title={`${fullNumber(failures.data?.total ?? 0)} parse failures`}
          subtitle="Commands rtk could not filter — these fell back to raw execution"
          bodyClassName="p-0"
        >
          {failures.error && <div className="p-4"><ErrorBox error={failures.error} /></div>}
          {failures.loading && !failures.data ? (
            <Spinner />
          ) : failures.data?.rows.length ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left text-faint">
                  <th className="w-40 px-4 py-2 font-normal">When</th>
                  <th className="px-4 py-2 font-normal">Command</th>
                  <th className="px-4 py-2 font-normal">Error</th>
                  <th className="w-24 px-4 py-2 font-normal">Fallback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {failures.data.rows.map((f) => (
                  <tr key={f.id} className="hover:bg-panel-2">
                    <td className="tnum px-4 py-2 whitespace-nowrap text-faint" title={f.timestamp}>
                      {relativeTime(f.timestamp)}
                    </td>
                    <td className="max-w-0 truncate px-4 py-2 font-mono text-fg" title={f.rawCommand}>
                      {f.rawCommand}
                    </td>
                    <td className="max-w-0 truncate px-4 py-2 text-warn" title={f.errorMessage}>
                      {f.errorMessage}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={f.fallbackSucceeded ? 'accent' : 'danger'}>
                        {f.fallbackSucceeded ? 'ok' : 'failed'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>No parse failures recorded. </Empty>
          )}
        </Card>
      )}

      <p className="px-1 text-[11px] text-faint">
        Projects: {shortPath(filter.project || 'all')} · rows update live as rtk runs.
      </p>
    </div>
  );
}
