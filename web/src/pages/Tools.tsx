import { useState } from 'react';
import { Play, Terminal } from 'lucide-react';
import type { Facets, CatalogCommand, RunResult } from '../api';
import { api } from '../api';
import { useAsync } from '../hooks';
import { Badge, Button, Card, ErrorBox, Select, Spinner, cx } from '../components/ui';
import { duration, shortPath } from '../lib/format';

export function Tools({ facets }: { facets: Facets | null }) {
  const catalog = useAsync(() => api.catalog(), []);
  const [selected, setSelected] = useState('gain');
  const [flags, setFlags] = useState<Record<string, boolean>>({ '--graph': true });
  const [options, setOptions] = useState<Record<string, string>>({});
  const [cwd, setCwd] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spec: CatalogCommand | undefined = catalog.data?.commands.find((c) => c.name === selected);

  function argsFor(cmd: CatalogCommand): string[] {
    const args: string[] = [];
    for (const flag of cmd.flags) if (flags[flag]) args.push(flag);
    for (const [opt, value] of Object.entries(options)) {
      if (value && cmd.options[opt]?.includes(value)) args.push(opt, value);
    }
    return args;
  }

  async function run() {
    if (!spec) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await api.run(spec.name, argsFor(spec), cwd || undefined));
    } catch (err) {
      setError(String((err as Error).message));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  const preview = spec
    ? `${catalog.data?.bin ?? 'rtk'} ${spec.name} ${argsFor(spec).join(' ')}`.trim()
    : '';

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <Card title="rtk commands" subtitle="Allowlisted, read-only subcommands">
        {catalog.loading && !catalog.data ? (
          <Spinner />
        ) : catalog.error ? (
          <ErrorBox error={catalog.error} />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              {catalog.data?.commands.map((c) => (
                <button
                  key={c.name}
                  onClick={() => {
                    setSelected(c.name);
                    setFlags({});
                    setOptions({});
                  }}
                  className={cx(
                    'w-full rounded-md border px-3 py-2 text-left transition-colors',
                    selected === c.name
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-transparent hover:bg-panel-2'
                  )}
                >
                  <div
                    className={cx(
                      'font-mono text-xs',
                      selected === c.name ? 'text-accent' : 'text-fg'
                    )}
                  >
                    rtk {c.name}
                  </div>
                  <div className="text-[11px] text-faint">{c.label}</div>
                </button>
              ))}
            </div>

            {spec && (spec.flags.length > 0 || Object.keys(spec.options).length > 0) && (
              <div className="space-y-2 border-t border-line pt-3">
                <div className="text-xs text-muted">Options</div>
                <div className="flex flex-wrap gap-1.5">
                  {spec.flags.map((flag) => (
                    <button
                      key={flag}
                      onClick={() => setFlags({ ...flags, [flag]: !flags[flag] })}
                      className={cx(
                        'rounded-md border px-2 py-1 font-mono text-[11px] transition-colors',
                        flags[flag]
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-line text-muted hover:text-fg'
                      )}
                    >
                      {flag}
                    </button>
                  ))}
                </div>
                {Object.entries(spec.options).map(([opt, values]) => (
                  <Select
                    key={opt}
                    label={opt}
                    value={options[opt] ?? ''}
                    onChange={(v) => setOptions({ ...options, [opt]: v })}
                    options={[
                      { value: '', label: 'default' },
                      ...values.map((v) => ({ value: v, label: v })),
                    ]}
                  />
                ))}
              </div>
            )}

            <div className="space-y-2 border-t border-line pt-3">
              <Select
                label="cwd"
                value={cwd}
                onChange={setCwd}
                options={[
                  { value: '', label: '$HOME' },
                  ...(facets?.projects ?? [])
                    .filter((p) => p.project && p.project !== '(unknown)')
                    .map((p) => ({ value: p.project, label: shortPath(p.project) })),
                ]}
              />
              <p className="text-[11px] text-faint">
                Affects <span className="font-mono">--project</span> scoping.
              </p>
            </div>

            <Button variant="primary" onClick={run} disabled={running || !spec} className="w-full justify-center">
              <Play className="size-3.5" />
              {running ? 'Running…' : 'Run'}
            </Button>
          </div>
        )}
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Terminal className="size-3.5 text-faint" />
            Output
          </span>
        }
        subtitle={preview}
        actions={
          result && (
            <div className="flex items-center gap-2">
              <Badge tone={result.exitCode === 0 ? 'accent' : 'danger'}>
                exit {result.exitCode}
              </Badge>
              <Badge>{duration(result.durationMs)}</Badge>
            </div>
          )
        }
        bodyClassName="p-0"
      >
        {error && <div className="p-4"><ErrorBox error={error} /></div>}
        {running && <Spinner label="Executing" />}
        {!running && !result && !error && (
          <div className="p-10 text-center text-xs text-faint">
            Pick a command and hit Run. Output appears here.
          </div>
        )}
        {result && !running && (
          <div className="max-h-[70vh] overflow-auto">
            <pre className="whitespace-pre-wrap px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fg">
              {result.stdout || '(no stdout)'}
            </pre>
            {result.stderr && (
              <pre className="whitespace-pre-wrap border-t border-line px-4 py-3 font-mono text-[11.5px] leading-relaxed text-warn">
                {result.stderr}
              </pre>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
