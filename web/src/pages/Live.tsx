import type { LiveState } from '../hooks';
import { Badge, Card, cx } from '../components/ui';
import { fullNumber, pct, shortPath, shortTime } from '../lib/format';

export function Live({ live, enabled, onToggle }: {
  live: LiveState;
  enabled: boolean;
  onToggle: (on: boolean) => void;
}) {
  const savedInFeed = live.recent.reduce((sum, r) => sum + r.savedTokens, 0);

  return (
    <Card
      title="Live command feed"
      subtitle="Streams from the rtk history database as commands run"
      actions={
        <div className="flex items-center gap-3">
          <Badge tone={savedInFeed > 0 ? 'accent' : 'neutral'}>
            +{fullNumber(savedInFeed)} tokens this session
          </Badge>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="accent-accent"
            />
            Live
          </label>
        </div>
      }
      bodyClassName="p-0"
    >
      {live.recent.length === 0 ? (
        <div className="p-12 text-center text-xs text-faint">
          {enabled
            ? 'Waiting for rtk activity… run any hooked command in a terminal and it lands here.'
            : 'Live streaming is paused.'}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {live.recent.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-panel-2"
            >
              <span className="tnum w-20 shrink-0 text-faint">{shortTime(r.timestamp)}</span>
              <Badge tone="info">{r.tool}</Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-fg" title={r.originalCmd}>
                {r.originalCmd}
              </span>
              <span className="hidden w-40 shrink-0 truncate text-right font-mono text-faint sm:block">
                {shortPath(r.project || '(unknown)', 1)}
              </span>
              <span
                className={cx(
                  'tnum w-16 shrink-0 text-right',
                  r.savedTokens > 0 ? 'text-accent' : 'text-faint'
                )}
              >
                {r.savedTokens > 0 ? `−${fullNumber(r.savedTokens)}` : '0'}
              </span>
              <span className="tnum w-12 shrink-0 text-right text-muted">
                {pct(r.savingsPct, 0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
