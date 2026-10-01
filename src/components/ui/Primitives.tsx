'use client';

import type { ReactNode } from 'react';

export function Panel({
  children,
  className,
  title,
  actions,
  strong = false,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
  strong?: boolean;
}) {
  return (
    <section className={`${strong ? 'surface-strong' : 'surface'} p-4 ${className ?? ''}`}>
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {typeof title === 'string' ? <h2 className="text-sm font-semibold tracking-wide">{title}</h2> : title}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const colors: Record<string, string> = {
    default: 'var(--text-muted)',
    good: '#4ade80',
    warn: '#fbbf24',
    bad: '#f87171',
    accent: 'var(--accent)',
  };
  return (
    <span className="chip" style={{ color: colors[tone], borderColor: `color-mix(in oklab, ${colors[tone]} 40%, transparent)` }}>
      {children}
    </span>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  return (
    <div className="w-full">
      <div
        style={{
          height: '0.35rem',
          borderRadius: '999px',
          background: 'var(--accent-soft)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, percent))}%`,
            height: '100%',
            background: 'var(--accent)',
            transition: 'width 180ms ease',
          }}
        />
      </div>
      {label && <p className="text-muted mt-1 text-xs">{label}</p>}
    </div>
  );
}

/** DeepSeek-style segmented control: a white pill on a muted track. */
export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className="inline-flex flex-wrap gap-0.5 rounded-[0.6rem] p-0.5"
      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border-subtle)' }}
      role="tablist"
    >
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="tab"
            aria-selected={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className="rounded-[0.45rem] transition-colors"
            style={{
              padding: size === 'sm' ? '0.2rem 0.55rem' : '0.32rem 0.7rem',
              fontSize: size === 'sm' ? '0.75rem' : '0.8125rem',
              fontWeight: active ? 600 : 500,
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              boxShadow: active ? '0 1px 2px var(--shadow-color)' : 'none',
              border: active ? '1px solid var(--border-subtle)' : '1px solid transparent',
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="animate-pulse-soft"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '999px',
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        animation: 'spin 900ms linear infinite',
      }}
    />
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted text-[0.7rem] uppercase tracking-wide">{label}</span>
      <span className="mono text-lg font-semibold" style={{ color: tone }}>
        {value}
      </span>
    </div>
  );
}
