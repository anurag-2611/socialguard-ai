import type { Thresholds } from '../lib/risk';
import type { Contribution } from '../lib/types';
import { cx, pct } from './ui';

/** Horizontal probability bar with the configured LOW/MEDIUM/HIGH bands marked. */
export function RiskMeter({ probability, thresholds }: { probability: number; thresholds: Thresholds }) {
  const left = Math.min(Math.max(probability, 0), 1) * 100;
  return (
    <div aria-label={`Risk probability ${pct(probability)}`}>
      <div className="relative h-3 w-full overflow-hidden rounded-full">
        <div className="absolute inset-y-0 left-0 bg-emerald-300" style={{ width: `${thresholds.low * 100}%` }} />
        <div className="absolute inset-y-0 bg-amber-300" style={{ left: `${thresholds.low * 100}%`, width: `${(thresholds.medium - thresholds.low) * 100}%` }} />
        <div className="absolute inset-y-0 right-0 bg-red-300" style={{ width: `${(1 - thresholds.medium) * 100}%` }} />
        <div className="absolute -inset-y-1 w-1 rounded bg-slate-900" style={{ left: `calc(${left}% - 2px)` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>0</span>
        <span>LOW &lt; {thresholds.low}</span>
        <span>HIGH &ge; {thresholds.medium}</span>
        <span>1</span>
      </div>
    </div>
  );
}

/** Diverging bars: right (red) pushes toward suspicious, left (green) toward genuine. */
export function ContributionBars({ items }: { items: Contribution[] }) {
  const max = Math.max(...items.map((i) => Math.abs(i.contribution)), 0.01);
  return (
    <ul className="space-y-2">
      {items.map((c) => {
        const width = (Math.abs(c.contribution) / max) * 50;
        const up = c.contribution > 0;
        return (
          <li key={c.feature} className="text-xs">
            <div className="mb-0.5 flex justify-between gap-2">
              <span className="font-medium text-slate-800">{c.label}</span>
              <span className={cx('tabular-nums', c.available ? 'text-slate-600' : 'italic text-slate-400')}>{c.value}</span>
            </div>
            <div className="relative h-2.5 rounded bg-slate-100">
              <div className="absolute inset-y-0 left-1/2 w-px bg-slate-400" />
              <div
                className={cx('absolute inset-y-0 rounded', up ? 'bg-red-400' : 'bg-emerald-400')}
                style={up ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }}
                title={`${c.contribution > 0 ? '+' : ''}${c.contribution.toFixed(2)} log-odds`}
              />
            </div>
            <div className="mt-0.5 text-[10px] text-slate-500">
              {up ? 'Raises risk' : 'Lowers risk'} ({c.contribution > 0 ? '+' : ''}
              {c.contribution.toFixed(2)} log-odds)
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Disclaimer() {
  return (
    <p className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
      <strong className="text-slate-800">MODEL SIGNAL, not proven fact.</strong> This is an automated risk estimate from public signals. It does
      not independently establish identity, intent, criminality or policy violation. Final decisions belong to a human reviewer and the platform.
    </p>
  );
}

export function BarList({ rows, empty }: { rows: { label: string; value: number; color: string }[]; empty: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (rows.every((r) => r.value === 0)) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2 text-xs">
          <span className="truncate text-slate-700">{r.label}</span>
          <div className="h-3 rounded bg-slate-100">
            <div className={cx('h-3 rounded', r.color)} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums text-slate-700">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
