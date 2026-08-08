import { useState } from 'react';
import { ExternalLink, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import type { DiscoverReport } from '../api';
import { api } from '../api';
import { Badge, Button, Card, Empty, ErrorBox, Kpi, Meter, Spinner, cx } from '../components/ui';
import { compactNumber, fullNumber, pct } from '../lib/format';

export function Discover() {
  const [report, setReport] = useState<DiscoverReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setReport(await api.discover());
    } catch (err) {
      setError(String((err as Error).message));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  const maxSaved = Math.max(1, ...(report?.missed ?? []).map((m) => m.savedTokens ?? 0));
  const adoption = report?.scanned.alreadyUsingPct ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs text-muted">
          Scans your Claude Code history for commands that ran raw when rtk already had a filter
          for them. Unlike the rest of this dashboard, this is a list of things to change rather
          than a record of what happened.
        </p>
        <Button variant="primary" onClick={run} disabled={loading}>
          <RefreshCw className={cx('size-3.5', loading && 'animate-spin')} />
          {loading ? 'Scanning…' : report ? 'Rescan' : 'Run scan'}
        </Button>
      </div>

      {error && <ErrorBox error={error} />}

      {loading && !report && <Spinner label="Scanning Claude Code history — this can take a minute" />}

      {!loading && !report && !error && (
        <Card>
          <Empty>
            <Search className="mx-auto mb-2 size-5 opacity-40" />
            Run a scan to see what you are leaving on the table.
          </Empty>
        </Card>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Saveable tokens"
              tone="accent"
              value={report.totals.tokens !== null ? compactNumber(report.totals.tokens) : '—'}
              hint={
                report.totals.commands !== null
                  ? `across ${fullNumber(report.totals.commands)} commands`
                  : undefined
              }
            />
            <Kpi
              label="rtk adoption"
              tone={adoption !== null && adoption >= 50 ? 'accent' : 'warn'}
              value={adoption !== null ? pct(adoption) : '—'}
              hint={
                report.scanned.alreadyUsingRtk !== null && report.scanned.bashCommands !== null
                  ? `${fullNumber(report.scanned.alreadyUsingRtk)} of ${fullNumber(report.scanned.bashCommands)} commands`
                  : undefined
              }
            />
            <Kpi
              label="Sessions scanned"
              value={report.scanned.sessions !== null ? fullNumber(report.scanned.sessions) : '—'}
              hint={report.scanned.days !== null ? `last ${report.scanned.days} days` : undefined}
            />
            <Kpi
              label="Unhandled commands"
              tone="info"
              value={fullNumber(report.unhandled.length)}
              hint="no rtk filter exists yet"
            />
          </div>

          <Card
            title="Missed savings"
            subtitle="Commands rtk already handles that ran raw anyway"
            bodyClassName="p-0"
          >
            {report.missed.length === 0 ? (
              <Empty>Nothing missed — every filterable command went through rtk.</Empty>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-faint">
                    <th className="px-4 py-2 font-normal">Command</th>
                    <th className="w-20 px-4 py-2 text-right font-normal">Count</th>
                    <th className="w-44 px-4 py-2 font-normal">Use instead</th>
                    <th className="w-48 px-4 py-2 text-right font-normal">Saveable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.missed.map((row) => (
                    <tr key={`${row.command}-${row.rtkEquivalent}`} className="hover:bg-panel-2">
                      <td className="max-w-0 truncate px-4 py-2 font-mono text-fg" title={row.command}>
                        {row.command}
                      </td>
                      <td className="tnum px-4 py-2 text-right text-muted">{row.count}</td>
                      <td className="px-4 py-2">
                        <Badge tone="accent">{row.rtkEquivalent}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-24">
                            <Meter value={row.savedTokens ?? 0} max={maxSaved} />
                          </div>
                          <span className="tnum w-16 text-right text-accent">
                            {row.savedTokens !== null ? fullNumber(row.savedTokens) : '—'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                <TriangleAlert className="size-3.5 text-faint" />
                Unhandled commands
              </span>
            }
            subtitle="Frequent commands with no rtk filter — candidates for an upstream issue"
            bodyClassName="p-0"
            actions={
              <a
                href="https://github.com/rtk-ai/rtk/issues"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-faint hover:text-fg"
              >
                Open an issue
                <ExternalLink className="size-3" />
              </a>
            }
          >
            {report.unhandled.length === 0 ? (
              <Empty>Nothing unhandled.</Empty>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-faint">
                    <th className="w-48 px-4 py-2 font-normal">Command</th>
                    <th className="w-20 px-4 py-2 text-right font-normal">Count</th>
                    <th className="px-4 py-2 font-normal">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.unhandled.map((row) => (
                    <tr key={row.command} className="hover:bg-panel-2">
                      <td className="px-4 py-2 font-mono text-fg">{row.command}</td>
                      <td className="tnum px-4 py-2 text-right text-muted">{row.count}</td>
                      <td
                        className="max-w-0 truncate px-4 py-2 font-mono text-faint"
                        title={row.example ?? ''}
                      >
                        {row.example}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <details className="panel px-4 py-3">
            <summary className="cursor-pointer text-xs text-muted">Raw rtk discover output</summary>
            <pre className="mt-3 overflow-auto whitespace-pre font-mono text-[11px] leading-relaxed text-faint">
              {report.raw}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
