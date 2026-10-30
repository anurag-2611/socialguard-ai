import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { STATUS_LABEL, type CaseStatus } from '../lib/caseStatus';
import type { RiskLevel } from '../lib/risk';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-lg border border-slate-200 bg-white shadow-sm', className)}>
      {title && (
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const RISK_STYLE: Record<RiskLevel, string> = {
  LOW: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-800 ring-amber-200',
  HIGH: 'bg-red-50 text-red-700 ring-red-200',
};
export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={cx('inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', RISK_STYLE[level])}>
      {level}
    </span>
  );
}

const STATUS_STYLE: Partial<Record<CaseStatus, string>> = {
  NEW: 'bg-blue-50 text-blue-700 ring-blue-200',
  UNDER_REVIEW: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  EVIDENCE_REQUIRED: 'bg-amber-50 text-amber-800 ring-amber-200',
  APPROVED_FOR_REPORTING: 'bg-teal-50 text-teal-700 ring-teal-200',
  REPORT_SUBMITTED: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  PLATFORM_REVIEW: 'bg-violet-50 text-violet-700 ring-violet-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200',
  FALSE_POSITIVE: 'bg-orange-50 text-orange-700 ring-orange-200',
  CLOSED: 'bg-slate-100 text-slate-600 ring-slate-200',
};
export function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span className={cx('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      {label}
    </span>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'warn' | 'success'; children: ReactNode }) {
  const style = {
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cx('rounded-md border px-3 py-2 text-sm', style)}>
      {children}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({ variant = 'primary', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const style = {
    primary: 'bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-300',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
    ghost: 'text-slate-600 hover:bg-slate-100',
  }[variant];
  return (
    <button
      {...rest}
      className={cx('inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed', style, className)}
    />
  );
}

const inputCls =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: string; error?: string | null; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, props.className)} />;
}

export function Stat({ label, value, tone = 'default', note }: { label: string; value: number | string; tone?: 'default' | 'red' | 'amber' | 'green'; note?: string }) {
  const color = { default: 'text-slate-900', red: 'text-red-600', amber: 'text-amber-600', green: 'text-emerald-600' }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx('mt-1 text-3xl font-semibold tabular-nums', color)}>{value}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
export const pct = (p: number): string => `${(p * 100).toFixed(1)}%`;
