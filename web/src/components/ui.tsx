import type { ReactNode } from 'react';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx('panel flex min-w-0 flex-col', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium text-fg">{title}</h2>
            {subtitle && <p className="truncate text-xs text-faint">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={cx('min-w-0 flex-1', bodyClassName ?? 'p-4')}>{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone = 'default',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'accent' | 'info' | 'warn';
  icon?: ReactNode;
}) {
  const toneClass = {
    default: 'text-fg',
    accent: 'text-accent',
    info: 'text-info',
    warn: 'text-warn',
  }[tone];

  return (
    <div className="panel px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={cx('tnum mt-1.5 text-2xl font-semibold tracking-tight', toneClass)}>
        {value}
      </div>
      {hint && <div className="tnum mt-0.5 truncate text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'info' | 'warn' | 'danger';
  title?: string;
}) {
  const tones = {
    neutral: 'border-line bg-panel-2 text-muted',
    accent: 'border-accent/30 bg-accent/10 text-accent',
    info: 'border-info/30 bg-info/10 text-info',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    danger: 'border-danger/30 bg-danger/10 text-danger',
  };
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-4',
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  type = 'button',
  title,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'ghost' | 'primary' | 'subtle';
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  className?: string;
}) {
  const variants = {
    ghost:
      'border-line bg-transparent text-muted hover:border-faint hover:text-fg disabled:hover:border-line',
    subtle: 'border-line bg-panel-2 text-fg hover:border-faint',
    primary:
      'border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 disabled:hover:bg-accent/15',
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  className?: string;
}) {
  return (
    <label className={cx('flex items-center gap-2 text-xs text-muted', className)}>
      {label && <span className="shrink-0">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 truncate rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-fg outline-none focus:border-faint"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs text-faint">
      <span className="size-3 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-xs text-faint">{children}</div>;
}

export function ErrorBox({ error }: { error: string }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
      {error}
    </div>
  );
}

/** Inline proportional bar used inside table cells. */
export function Meter({ value, max, tone = 'accent' }: { value: number; max: number; tone?: 'accent' | 'info' }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
      <div
        className={cx('h-full rounded-full', tone === 'accent' ? 'bg-accent/70' : 'bg-info/70')}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
