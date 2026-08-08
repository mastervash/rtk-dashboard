import { Activity, LayoutDashboard, ListTree, Radio, Settings2, Sparkles, Terminal } from 'lucide-react';
import type { Filter } from './api';
import { EMPTY_FILTER, api } from './api';
import { useAsync, useLiveStream, useStored } from './hooks';
import { Overview } from './pages/Overview';
import { History } from './pages/History';
import { Tools } from './pages/Tools';
import { ConfigEditor } from './pages/ConfigEditor';
import { Live } from './pages/Live';
import { Discover } from './pages/Discover';
import { cx } from './components/ui';
import { bytes, relativeTime } from './lib/format';

type Tab = 'overview' | 'history' | 'live' | 'discover' | 'tools' | 'config';

const NAV: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'history', label: 'History', icon: ListTree },
  { id: 'live', label: 'Live', icon: Radio },
  { id: 'discover', label: 'Discover', icon: Sparkles },
  { id: 'tools', label: 'Tools', icon: Terminal },
  { id: 'config', label: 'Config', icon: Settings2 },
];

export default function App() {
  const [tab, setTab] = useStored<Tab>('tab', 'overview');
  const [filter, setFilter] = useStored<Filter>('filter', EMPTY_FILTER);
  const [liveEnabled, setLiveEnabled] = useStored('live', true);

  const live = useLiveStream(liveEnabled);
  const facets = useAsync(() => api.facets(), [live.revision]);
  const meta = useAsync(() => api.meta(), [live.revision]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="grid size-7 place-items-center rounded-md bg-accent/15 text-accent">
            <Activity className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">rtkdash</div>
            <div className="text-[10px] text-faint">rust token killer</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs transition-colors',
                tab === id ? 'bg-panel-2 text-fg' : 'text-muted hover:bg-panel-2/60 hover:text-fg'
              )}
            >
              <Icon className="size-4" />
              {label}
              {id === 'live' && live.connected && (
                <span className="ml-auto size-1.5 animate-pulse rounded-full bg-accent" />
              )}
            </button>
          ))}
        </nav>

        <div className="space-y-1.5 border-t border-line px-4 py-3 text-[10px] text-faint">
          <div className="flex items-center gap-1.5">
            <span
              className={cx(
                'size-1.5 rounded-full',
                live.connected ? 'bg-accent' : liveEnabled ? 'bg-warn' : 'bg-faint'
              )}
            />
            {live.connected ? 'streaming' : liveEnabled ? 'reconnecting' : 'paused'}
          </div>
          {meta.data && (
            <>
              <div className="tnum">{bytes(meta.data.db.sizeBytes)} history.db</div>
              <div className="tnum">updated {relativeTime(meta.data.db.mtimeMs)}</div>
            </>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-5">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight capitalize">
            {NAV.find((n) => n.id === tab)?.label}
          </h1>
          {live.lastEventAt && (
            <span className="text-[11px] text-faint">
              last activity {relativeTime(live.lastEventAt)}
            </span>
          )}
        </header>

        {tab === 'overview' && (
          <Overview
            filter={filter}
            onFilterChange={setFilter}
            facets={facets.data}
            revision={live.revision}
          />
        )}
        {tab === 'history' && (
          <History
            filter={filter}
            onFilterChange={setFilter}
            facets={facets.data}
            revision={live.revision}
          />
        )}
        {tab === 'live' && <Live live={live} enabled={liveEnabled} onToggle={setLiveEnabled} />}
        {tab === 'discover' && <Discover />}
        {tab === 'tools' && <Tools facets={facets.data} />}
        {tab === 'config' && <ConfigEditor />}
      </main>
    </div>
  );
}
