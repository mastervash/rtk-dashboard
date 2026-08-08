import { Activity, Coins, Gauge, Layers, Timer, Zap } from 'lucide-react';
import type { Facets, Filter } from '../api';
import { api } from '../api';
import { useAsync } from '../hooks';
import { CommandVolume, SavingsOverTime, ToolBreakdown } from '../components/Charts';
import { FilterBar } from '../components/FilterBar';
import { Card, Empty, ErrorBox, Kpi, Meter, Spinner } from '../components/ui';
import { compactNumber, duration, fullNumber, pct, relativeTime, shortPath } from '../lib/format';

export function Overview({
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
  const key = [filter.days, filter.project, filter.tool, revision];
  const summary = useAsync(() => api.summary(filter), key);
  const series = useAsync(() => api.timeseries(filter), key);
  const projects = useAsync(() => api.projects(filter, 12), key);
  const tools = useAsync(() => api.tools(filter, 20), key);

  const s = summary.data;
  const maxProjectSaved = Math.max(1, ...(projects.data ?? []).map((p) => p.savedTokens));

  return (
    <div className="space-y-4">
      <FilterBar filter={filter} onChange={onFilterChange} facets={facets} />

      {summary.error && <ErrorBox error={summary.error} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Tokens saved"
          tone="accent"
          icon={<Coins className="size-3.5" />}
          value={s ? compactNumber(s.savedTokens) : '—'}
          hint={s ? `${fullNumber(s.savedTokens)} tokens` : undefined}
        />
        <Kpi
          label="Savings rate"
          tone="accent"
          icon={<Gauge className="size-3.5" />}
          value={s ? pct(s.weightedSavingsPct) : '—'}
          hint={s ? `${pct(s.avgSavingsPct)} unweighted` : undefined}
        />
        <Kpi
          label="Commands"
          icon={<Zap className="size-3.5" />}
          value={s ? fullNumber(s.commands) : '—'}
          hint={s ? `${s.tools} distinct filters` : undefined}
        />
        <Kpi
          label="Raw → filtered"
          icon={<Activity className="size-3.5" />}
          value={s ? `${compactNumber(s.inputTokens)} → ${compactNumber(s.outputTokens)}` : '—'}
          hint={s ? `${fullNumber(s.inputTokens - s.outputTokens)} removed` : undefined}
        />
        <Kpi
          label="Projects"
          icon={<Layers className="size-3.5" />}
          value={s ? fullNumber(s.projects) : '—'}
          hint={s?.lastSeen ? `last run ${relativeTime(s.lastSeen)}` : undefined}
        />
        <Kpi
          label="Exec time"
          icon={<Timer className="size-3.5" />}
          value={s ? duration(s.totalTimeMs) : '—'}
          hint={s ? `${duration(s.avgTimeMs)} avg` : undefined}
        />
      </div>

      <Card
        title="Tokens saved per day"
        subtitle="Green area: tokens saved. Blue dashed: average savings rate."
      >
        {series.loading && !series.data ? (
          <Spinner />
        ) : series.data?.length ? (
          <>
            <SavingsOverTime data={series.data} />
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1 text-xs text-muted">Command volume</div>
              <CommandVolume data={series.data} />
            </div>
          </>
        ) : (
          <Empty>No commands recorded in this range.</Empty>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Savings by filter" subtitle="Which rtk subcommands do the heavy lifting">
          {tools.loading && !tools.data ? (
            <Spinner />
          ) : tools.data?.length ? (
            <ToolBreakdown data={tools.data} />
          ) : (
            <Empty>Nothing to chart yet.</Empty>
          )}
        </Card>

        <Card title="Top projects" subtitle="Click a row to filter the whole dashboard" bodyClassName="p-0">
          {projects.loading && !projects.data ? (
            <Spinner />
          ) : projects.data?.length ? (
            <div className="divide-y divide-line">
              {projects.data.map((p) => (
                <button
                  key={p.project}
                  onClick={() => onFilterChange({ ...filter, project: p.project })}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-panel-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs text-fg" title={p.project}>
                      {shortPath(p.project, 2)}
                    </div>
                    <div className="mt-1.5">
                      <Meter value={p.savedTokens} max={maxProjectSaved} />
                    </div>
                  </div>
                  <div className="tnum shrink-0 text-right">
                    <div className="text-xs text-accent">{compactNumber(p.savedTokens)}</div>
                    <div className="text-[11px] text-faint">{p.commands} cmds</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty>No projects in this range.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
