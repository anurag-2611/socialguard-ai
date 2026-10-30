import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarList } from '../components/RiskViz';
import { Card, EmptyState, fmtDate, PageHeader, pct, RiskBadge, Stat, StatusBadge } from '../components/ui';
import { CASE_STATUSES, isOpen, STATUS_LABEL } from '../lib/caseStatus';
import { can } from '../lib/permissions';
import { currentUser, userName, useStore } from '../store/store';

export function Dashboard() {
  const analyses = useStore((s) => s.analyses);
  const cases = useStore((s) => s.cases);
  const user = currentUser();

  const m = useMemo(() => {
    const byId = new Map(analyses.map((a) => [a.id, a]));
    const level = (caseAnalysisId: string) => byId.get(caseAnalysisId)?.riskLevel;
    return {
      total: analyses.length,
      suspicious: analyses.filter((a) => a.riskLevel !== 'LOW').length,
      high: cases.filter((c) => level(c.analysisId) === 'HIGH').length,
      medium: cases.filter((c) => level(c.analysisId) === 'MEDIUM').length,
      low: cases.filter((c) => level(c.analysisId) === 'LOW').length,
      open: cases.filter((c) => isOpen(c.status)).length,
      resolved: cases.filter((c) => c.status === 'RESOLVED').length,
      riskRows: (['HIGH', 'MEDIUM', 'LOW'] as const).map((l) => ({
        label: l,
        value: analyses.filter((a) => a.riskLevel === l).length,
        color: l === 'HIGH' ? 'bg-red-400' : l === 'MEDIUM' ? 'bg-amber-400' : 'bg-emerald-400',
      })),
      statusRows: CASE_STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: cases.filter((c) => c.status === s).length, color: 'bg-blue-500' })),
      byId,
    };
  }, [analyses, cases]);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Figures are computed from the analyses and cases in this workspace. Nothing is pre-filled." />
      {m.total === 0 ? (
        <EmptyState
          title="No profiles analyzed yet"
          text="Submit a profile for analysis to see risk scores, cases and trends here."
          action={can(user?.role, 'profiles.analyze') ? <Link className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800" to="/analyze">Analyze a profile</Link> : undefined}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Profiles analyzed" value={m.total} />
            <Stat label="Suspicious profiles" value={m.suspicious} tone="amber" note="Medium or high risk" />
            <Stat label="Open cases" value={m.open} />
            <Stat label="Resolved cases" value={m.resolved} tone="green" />
            <Stat label="High-risk cases" value={m.high} tone="red" />
            <Stat label="Medium-risk cases" value={m.medium} tone="amber" />
            <Stat label="Low-risk cases" value={m.low} tone="green" />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card title="Risk distribution of analyzed profiles"><BarList rows={m.riskRows} empty="No analyses yet." /></Card>
            <Card title="Cases by status"><BarList rows={m.statusRows} empty="No cases yet." /></Card>
          </div>
          <Card title="Recent cases" className="mt-5" action={<Link to="/cases" className="text-xs text-blue-700 hover:underline">View all</Link>}>
            {cases.length === 0 ? (
              <p className="text-sm text-slate-500">No cases yet. High-risk analyses create a case automatically.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr><th className="py-2">Case</th><th>Risk</th><th>Status</th><th>Analyst</th><th>Created</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cases.slice(0, 5).map((c) => {
                    const a = m.byId.get(c.analysisId);
                    return (
                      <tr key={c.id}>
                        <td className="py-2"><Link className="font-medium text-blue-700 hover:underline" to={`/cases/${c.id}`}>{c.caseNumber}</Link></td>
                        <td>{a && (<span className="inline-flex items-center gap-2"><RiskBadge level={a.riskLevel} /><span className="text-xs text-slate-500">{pct(a.result.risk_probability)}</span></span>)}</td>
                        <td><StatusBadge status={c.status} /></td>
                        <td>{userName(c.assignedAnalystId)}</td>
                        <td className="text-slate-500">{fmtDate(c.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </>
  );
}
