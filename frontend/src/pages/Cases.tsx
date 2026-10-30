import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Field, fmtDate, PageHeader, pct, RiskBadge, Select, StatusBadge, Input } from '../components/ui';
import { CASE_STATUSES, STATUS_LABEL, type CaseStatus } from '../lib/caseStatus';
import { LEVEL_ORDER, type RiskLevel } from '../lib/risk';
import { PLATFORM_LABEL, PLATFORMS, type Platform } from '../lib/types';
import { userName, useStore } from '../store/store';

export function Cases() {
  const cases = useStore((s) => s.cases);
  const analyses = useStore((s) => s.analyses);
  const [status, setStatus] = useState<'' | CaseStatus>('');
  const [risk, setRisk] = useState<'' | RiskLevel>('');
  const [platform, setPlatform] = useState<'' | Platform>('');
  const [analyst, setAnalyst] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const rows = useMemo(() => {
    const byId = new Map(analyses.map((a) => [a.id, a]));
    return cases
      .map((c) => ({ c, a: byId.get(c.analysisId) }))
      .filter(({ c, a }) => {
        if (!a) return false;
        if (status && c.status !== status) return false;
        if (risk && a.riskLevel !== risk) return false;
        if (platform && a.platform !== platform) return false;
        if (analyst && c.assignedAnalystId !== analyst) return false;
        if (from && c.createdAt.slice(0, 10) < from) return false;
        if (to && c.createdAt.slice(0, 10) > to) return false;
        return true;
      });
  }, [cases, analyses, status, risk, platform, analyst, from, to]);

  const analysts = [...new Set(cases.map((c) => c.assignedAnalystId))];
  const filtered = status || risk || platform || analyst || from || to;

  return (
    <>
      <PageHeader title="Cases" subtitle="High-risk analyses create cases automatically; analysts can also open a case from any analysis." />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Status" htmlFor="f-status"><Select id="f-status" value={status} onChange={(e) => setStatus(e.target.value as '' | CaseStatus)}><option value="">All</option>{CASE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select></Field>
          <Field label="Risk" htmlFor="f-risk"><Select id="f-risk" value={risk} onChange={(e) => setRisk(e.target.value as '' | RiskLevel)}><option value="">All</option>{LEVEL_ORDER.map((l) => <option key={l}>{l}</option>)}</Select></Field>
          <Field label="Platform" htmlFor="f-platform"><Select id="f-platform" value={platform} onChange={(e) => setPlatform(e.target.value as '' | Platform)}><option value="">All</option>{PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</Select></Field>
          <Field label="Analyst" htmlFor="f-analyst"><Select id="f-analyst" value={analyst} onChange={(e) => setAnalyst(e.target.value)}><option value="">All</option>{analysts.map((id) => <option key={id} value={id}>{userName(id)}</option>)}</Select></Field>
          <Field label="From" htmlFor="f-from"><Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" htmlFor="f-to"><Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </Card>
      {cases.length === 0 ? (
        <EmptyState title="No cases yet" text="Analyze a profile. A high-risk result opens a case automatically." />
      ) : rows.length === 0 ? (
        <EmptyState title="No cases match these filters" text={filtered ? 'Clear a filter to see more cases.' : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-2">Case</th><th>Profile</th><th>Risk</th><th>Status</th><th>Priority</th><th>Analyst</th><th>Created</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ c, a }) => a && (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2"><Link className="font-medium text-blue-700 hover:underline" to={`/cases/${c.id}`}>{c.caseNumber}</Link></td>
                  <td>@{a.profile.username} <span className="text-xs text-slate-500">({PLATFORM_LABEL[a.platform]})</span></td>
                  <td><span className="inline-flex items-center gap-2"><RiskBadge level={a.riskLevel} /><span className="text-xs text-slate-500">{pct(a.result.risk_probability)}</span></span></td>
                  <td><StatusBadge status={c.status} /></td>
                  <td>{c.priority === 'HIGH' ? <span className="text-xs font-medium text-red-600">High</span> : <span className="text-xs text-slate-500">Normal</span>}</td>
                  <td>{userName(c.assignedAnalystId)}</td>
                  <td className="text-slate-500">{fmtDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
