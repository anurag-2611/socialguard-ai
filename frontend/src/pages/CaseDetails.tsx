import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ContributionBars, Disclaimer, RiskMeter } from '../components/RiskViz';
import { Alert, Button, Card, EmptyState, fmtDate, PageHeader, pct, RiskBadge, StatusBadge, Textarea } from '../components/ui';
import { availableTransitions, STATUS_LABEL, type CaseStatus } from '../lib/caseStatus';
import { can, ROLE_PERMISSIONS } from '../lib/permissions';
import { PLATFORM_LABEL } from '../lib/types';
import { addEvidence, addNote, changeStatus, currentUser, generateReport, userName, useStore } from '../store/store';

const REASON_REQUIRED: CaseStatus[] = ['EVIDENCE_REQUIRED', 'REJECTED', 'FALSE_POSITIVE'];

export function CaseDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = currentUser();
  const record = useStore((s) => s.cases.find((c) => c.id === id));
  const analysis = useStore((s) => s.analyses.find((a) => a.id === record?.analysisId));
  // Select the stable array and filter afterwards: a selector that builds a new array on every call
  // makes useSyncExternalStore re-render forever.
  const allReports = useStore((s) => s.reports);
  const reports = allReports.filter((r) => r.caseId === id);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [obs, setObs] = useState('');
  const [filed, setFiled] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  if (!record || !analysis || !user) {
    return <EmptyState title="Case not found" action={<Link className="text-sm text-blue-700 hover:underline" to="/cases">Back to cases</Link>} />;
  }

  const next = availableTransitions(record.status, ROLE_PERMISSIONS[user.role], { actorId: user.id, caseCreatorId: record.createdById });
  const report = (text: string, ok: boolean) => setMsg({ kind: ok ? 'success' : 'error', text });

  function move(to: CaseStatus) {
    if (!record) return;
    if (REASON_REQUIRED.includes(to) && !reason.trim()) return report('Add a short reason for this decision.', false);
    if (to === 'REPORT_SUBMITTED' && !filed) return report('Confirm that you filed the report through the platform\'s official channel.', false);
    const r = changeStatus(record.id, to, reason);
    if (r.ok) { setReason(''); setFiled(false); report(`Status changed to ${STATUS_LABEL[to]}.`, true); } else report(r.error, false);
  }

  return (
    <>
      <PageHeader
        title={record.caseNumber}
        subtitle={`${PLATFORM_LABEL[analysis.platform]} @${analysis.profile.username}`}
        action={<div className="flex items-center gap-2"><RiskBadge level={analysis.riskLevel} /><StatusBadge status={record.status} /></div>}
      />
      {msg && <div className="mb-4"><Alert kind={msg.kind}>{msg.text}</Alert></div>}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card title="Profile">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-slate-500">URL</dt><dd className="truncate">{analysis.profileUrl}</dd>
              <dt className="text-slate-500">Official account compared</dt><dd>{analysis.profile.official_username ? `@${analysis.profile.official_username}` : 'not provided'}</dd>
              <dt className="text-slate-500">Account age</dt><dd>{analysis.profile.account_age_days ?? 'unavailable'}{analysis.profile.account_age_days !== null && ' days'}</dd>
              <dt className="text-slate-500">Followers / following / posts</dt><dd>{[analysis.profile.followers, analysis.profile.following, analysis.profile.posts].map((v) => v ?? 'n/a').join(' / ')}</dd>
              <dt className="text-slate-500">Detected</dt><dd>{fmtDate(analysis.createdAt)}</dd>
            </dl>
          </Card>

          <Card title="Risk assessment">
            <div className="mb-3 flex items-end justify-between">
              <p className="text-3xl font-semibold tabular-nums">{pct(analysis.result.risk_probability)}</p>
              <p className="text-xs text-slate-500">{analysis.result.model_name} {analysis.result.model_version} - schema {analysis.result.feature_schema_version}</p>
            </div>
            <RiskMeter probability={analysis.result.risk_probability} thresholds={analysis.thresholdsSnapshot} />
            <div className="mt-4"><ContributionBars items={analysis.result.contributions} /></div>
            <div className="mt-4"><Disclaimer /></div>
          </Card>

          <Card title={`Evidence (${record.evidence.length})`}>
            <ul className="divide-y divide-slate-100 text-sm">
              {record.evidence.map((e) => (
                <li key={e.id} className="py-2">
                  <div className="flex justify-between gap-2"><span className="font-medium">{e.type.replace(/_/g, ' ').toLowerCase()}</span><span className="text-xs text-slate-500">{fmtDate(e.capturedAt)}</span></div>
                  <p className="text-slate-700">{e.description}</p>
                  <p className="text-xs text-slate-500">Source: {e.source}</p>
                  <p className="font-mono text-[11px] text-slate-400" title={e.sha256}>sha256 {e.sha256.slice(0, 24)}...</p>
                </li>
              ))}
            </ul>
            {can(user.role, 'cases.evidence.add') && (
              <div className="mt-3 space-y-2">
                <Textarea aria-label="New observation" rows={2} placeholder="Add an observation you can document (no screenshots are fabricated)" value={obs} onChange={(e) => setObs(e.target.value)} />
                <Button variant="secondary" onClick={async () => { const r = await addEvidence(record.id, obs); if (r.ok) setObs(''); report(r.ok ? 'Observation added as evidence.' : r.error, r.ok); }}>Add observation</Button>
              </div>
            )}
          </Card>

          <Card title={`Reviewer and investigation notes (${record.notes.length})`}>
            {record.notes.length === 0 ? <p className="text-sm text-slate-500">No notes yet.</p> : (
              <ul className="space-y-3 text-sm">
                {record.notes.map((n) => (<li key={n.id}><p className="text-xs text-slate-500">{userName(n.authorId)} - {fmtDate(n.createdAt)}</p><p>{n.body}</p></li>))}
              </ul>
            )}
            {can(user.role, 'cases.notes.add') && (
              <div className="mt-3 space-y-2">
                <Textarea aria-label="New note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                <Button variant="secondary" onClick={() => { const r = addNote(record.id, note); if (r.ok) setNote(''); report(r.ok ? 'Note added.' : r.error, r.ok); }}>Add note</Button>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Actions">
            {record.status === 'CLOSED' ? (
              <p className="text-sm text-slate-500">This case is closed.</p>
            ) : next.length === 0 ? (
              <p className="text-sm text-slate-500">No actions are available to your role ({user.role.replace('_', ' ').toLowerCase()}) in this status.</p>
            ) : (
              <div className="space-y-3">
                <Textarea aria-label="Reason" rows={2} placeholder="Reason (required for evidence request, rejection and false positive)" value={reason} onChange={(e) => setReason(e.target.value)} />
                {next.includes('REPORT_SUBMITTED') && (
                  <label className="flex items-start gap-2 text-xs text-slate-700">
                    <input type="checkbox" className="mt-0.5" checked={filed} onChange={(e) => setFiled(e.target.checked)} />
                    I filed this report through the platform&apos;s official channel. (This app does not submit anything itself.)
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  {next.map((to) => (<Button key={to} variant={to === 'REJECTED' || to === 'FALSE_POSITIVE' ? 'secondary' : 'primary'} onClick={() => move(to)}>{STATUS_LABEL[to]}</Button>))}
                </div>
              </div>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-1 border-t border-slate-100 pt-3 text-xs">
              <dt className="text-slate-500">Analyst</dt><dd>{userName(record.assignedAnalystId)}</dd>
              <dt className="text-slate-500">Reviewer</dt><dd>{record.assignedReviewerId ? userName(record.assignedReviewerId) : 'not assigned'}</dd>
              <dt className="text-slate-500">Priority</dt><dd>{record.priority === 'HIGH' ? 'High' : 'Normal'}</dd>
              {record.resolution && (<><dt className="text-slate-500">Resolution</dt><dd>{record.resolution}</dd></>)}
            </dl>
          </Card>

          <Card title="Report">
            <p className="mb-3 text-xs text-slate-600">Generates an official report pack for you to file with the platform. Nothing is submitted automatically, and removal is never guaranteed.</p>
            {can(user.role, 'reports.generate') && (
              <Button onClick={async () => { const r = await generateReport(record.id); if (r.ok) navigate(`/reports/${r.report.id}`); else report(r.error, false); }}>Generate official report</Button>
            )}
            {reports.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {reports.map((r) => (<li key={r.id}><Link className="text-blue-700 hover:underline" to={`/reports/${r.id}`}>Report from {fmtDate(r.generatedAt)}</Link></li>))}
              </ul>
            )}
          </Card>

          <Card title="Timeline">
            <ol className="space-y-3 border-l border-slate-200 pl-4 text-sm">
              {[...record.history].reverse().map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-blue-600" />
                  <p className="font-medium">{h.from ? `${STATUS_LABEL[h.from]} to ${STATUS_LABEL[h.to]}` : STATUS_LABEL[h.to]}</p>
                  <p className="text-xs text-slate-500">{userName(h.byId)} - {fmtDate(h.at)}</p>
                  {h.reason && <p className="text-xs text-slate-700">{h.reason}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
