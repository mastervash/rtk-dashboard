import { useEffect, useMemo, useState } from 'react';
import { Check, RotateCcw, Save } from 'lucide-react';
import { api } from '../api';
import { useAsync } from '../hooks';
import { Badge, Button, Card, ErrorBox, Spinner, cx } from '../components/ui';
import { relativeTime } from '../lib/format';

export function ConfigEditor() {
  const bundle = useAsync(() => api.config(), []);
  const [active, setActive] = useState('config.toml');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [validation, setValidation] = useState<{ valid: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const file = bundle.data?.files.find((f) => f.name === active);
  const original = file?.content ?? '';
  const content = draft[active] ?? original;
  const dirty = content !== original;

  // Debounced TOML syntax check so the editor flags mistakes before saving.
  useEffect(() => {
    if (!dirty) {
      setValidation(null);
      return;
    }
    const timer = setTimeout(() => {
      api.validateConfig(content).then(setValidation).catch(() => setValidation(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [content, dirty]);

  const lineCount = useMemo(() => content.split('\n').length, [content]);

  async function save() {
    if (!file) return;
    setSaving(true);
    setStatus(null);
    try {
      await api.saveConfig(file.name, content);
      setDraft((d) => {
        const next = { ...d };
        delete next[file.name];
        return next;
      });
      bundle.reload();
      setStatus({ kind: 'ok', text: 'Saved. A timestamped .bak of the previous file was kept.' });
    } catch (err) {
      setStatus({ kind: 'err', text: String((err as Error).message) });
    } finally {
      setSaving(false);
    }
  }

  if (bundle.loading && !bundle.data) return <Spinner />;
  if (bundle.error) return <ErrorBox error={bundle.error} />;

  return (
    <div className="space-y-4">
      <Card
        title="rtk configuration"
        subtitle={bundle.data?.dir}
        actions={
          <div className="flex items-center gap-2">
            {bundle.data?.readonly && <Badge tone="warn">read-only mode</Badge>}
            {dirty &&
              (validation === null ? (
                <Badge>checking…</Badge>
              ) : validation.valid ? (
                <Badge tone="accent">valid TOML</Badge>
              ) : (
                <Badge tone="danger" title={validation.error}>
                  invalid TOML
                </Badge>
              ))}
            <Button
              onClick={() =>
                setDraft((d) => {
                  const next = { ...d };
                  delete next[active];
                  return next;
                })
              }
              disabled={!dirty}
            >
              <RotateCcw className="size-3.5" />
              Revert
            </Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={!dirty || saving || bundle.data?.readonly || validation?.valid === false}
            >
              <Save className="size-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="flex gap-1 border-b border-line px-3 py-2">
          {bundle.data?.files.map((f) => (
            <button
              key={f.name}
              onClick={() => setActive(f.name)}
              className={cx(
                'rounded px-2.5 py-1 font-mono text-xs transition-colors',
                active === f.name ? 'bg-panel-2 text-fg' : 'text-muted hover:text-fg'
              )}
            >
              {f.name}
              {draft[f.name] !== undefined && draft[f.name] !== f.content && (
                <span className="ml-1.5 text-accent">•</span>
              )}
            </button>
          ))}
        </div>

        {status && (
          <div
            className={cx(
              'flex items-center gap-2 border-b border-line px-4 py-2 text-xs',
              status.kind === 'ok' ? 'text-accent' : 'text-danger'
            )}
          >
            {status.kind === 'ok' && <Check className="size-3.5" />}
            {status.text}
          </div>
        )}

        {validation && !validation.valid && (
          <div className="border-b border-line px-4 py-2 font-mono text-[11px] text-danger">
            {validation.error}
          </div>
        )}

        <textarea
          value={content}
          spellCheck={false}
          onChange={(e) => setDraft({ ...draft, [active]: e.target.value })}
          className="min-h-[60vh] w-full resize-y bg-transparent px-4 py-3 font-mono text-[12.5px] leading-relaxed text-fg outline-none"
        />

        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-faint">
          <span className="font-mono">{file?.path}</span>
          <span className="tnum">
            {lineCount} lines · {content.length} bytes ·{' '}
            {file?.mtimeMs ? `modified ${relativeTime(file.mtimeMs)}` : 'not created yet'}
          </span>
        </div>
      </Card>

      <p className="px-1 text-[11px] text-faint">
        Edits are validated as TOML before writing, and the previous file is copied to a
        timestamped <span className="font-mono">.bak</span> alongside it. rtk reads config at
        process start, so changes apply to the next command.
      </p>
    </div>
  );
}
