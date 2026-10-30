import { Link, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, fmtDate, PageHeader, pct, RiskBadge } from '../components/ui';
import { Disclaimer } from '../components/RiskViz';
import { STATUS_LABEL } from '../lib/caseStatus';
import { PLATFORM_LABEL } from '../lib/types';
import { userName, useStore } from '../store/store';

export function Reports() {
  const reports = useStore((s) => s.reports);
  return (
    <>
      <PageHeader title="Reports" subtitle="Reports are generated from a case. Open one to preview it and save it as a PDF." />
      {reports.length === 0 ? (
        <EmptyState title="No reports generated yet" text="Open a case and choose Generate official report." action={<Link className="text-sm text-blue-700 hover:underline" to="/cases">Go to cases</Link>} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Case</th><th>Risk</th><th>Generated</th><th>By</th><th>Integrity hash</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-medium">{r.caseNumber}</td>
                  <td><RiskBadge level={r.snapshot.riskLevel} /></td>
                  <td className="text-slate-500">{fmtDate(r.generatedAt)}</td>
                  <td>{userName(r.generatedById)}</td>
                  <td className="font-mono text-xs text-slate-400" title={r.sha256}>{r.sha256.slice(0, 16)}...</td>
                  <td><Link className="text-blue-700 hover:underline" to={`/reports/${r.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function ReportView() {
  const { id } = useParams();
  const report = useStore((s) => s.reports.find((r) => r.id === id));
  if (!report) return <EmptyState title="Report not found" action={<Link className="text-sm text-blue-700 hover:underline" to="/reports">Back to reports</Link>} />;
  const s = report.snapshot;
  return (
    <>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link className="text-sm text-blue-700 hover:underline" to="/reports">Back to reports</Link>
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>
      <Card className="print:border-0 print:shadow-none">
        <article className="space-y-5 text-sm">
          <header className="border-b border-slate-200 pb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">SocialGuard AI</p>
            <h1 className="text-xl font-semibold text-slate-900">Suspicious Profile Assessment Report</h1>
          </header>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1">
            <dt className="text-slate-500">Case ID</dt><dd className="font-medium">{report.caseNumber}</dd>
            <dt className="text-slate-500">Platform</dt><dd>{PLATFORM_LABEL[s.platform]}</dd>
            <dt className="text-slate-500">Profile URL</dt><dd className="break-all">{s.profileUrl}</dd>
            <dt className="text-slate-500">Detection time</dt><dd>{fmtDate(s.detectionTime)}</dd>
            <dt className="text-slate-500">Risk score</dt><dd>{pct(s.riskProbability)} <span className="ml-2"><RiskBadge level={s.riskLevel} /></span></dd>
            <dt className="text-slate-500">Model</dt><dd>{s.modelName} (version {s.modelVersion}, dataset {s.datasetVersion})</dd>
            <dt className="text-slate-500">Case status</dt><dd>{STATUS_LABEL[s.status]}</dd>
            <dt className="text-slate-500">Reviewer</dt><dd>{s.reviewer ?? 'not yet reviewed'}</dd>
          </dl>
          <section>
            <h2 className="mb-1 font-semibold text-slate-900">Indicators (model signals)</h2>
            <ol className="list-decimal space-y-0.5 pl-5">
              {s.indicators.map((i) => (<li key={i.label}>{i.label}: {i.value} - {i.contribution > 0 ? 'raises' : 'lowers'} risk ({i.contribution > 0 ? '+' : ''}{i.contribution.toFixed(2)} log-odds)</li>))}
            </ol>
            {s.unavailable.length > 0 && <p className="mt-2 text-xs text-slate-600">Unavailable inputs: {s.unavailable.join(', ')}</p>}
          </section>
          <section>
            <h2 className="mb-1 font-semibold text-slate-900">Evidence</h2>
            <ul className="space-y-2">
              {s.evidence.map((e, i) => (
                <li key={i} className="rounded border border-slate-200 p-2">
                  <p className="font-medium">{e.type.replace(/_/g, ' ').toLowerCase()} - {fmtDate(e.capturedAt)}</p>
                  <p>{e.description}</p>
                  <p className="text-xs text-slate-500">Source: {e.source}</p>
                  <p className="break-all font-mono text-[10px] text-slate-400">sha256 {e.sha256}</p>
                </li>
              ))}
            </ul>
          </section>
          <Disclaimer />
          <footer className="border-t border-slate-200 pt-3 text-[11px] text-slate-500">
            Generated {fmtDate(report.generatedAt)} by {userName(report.generatedById)}. Report integrity hash (SHA-256): <span className="break-all font-mono">{report.sha256}</span>.
            This report has not been submitted to any platform; it is prepared for filing through the platform&apos;s official channel.
          </footer>
        </article>
      </Card>
    </>
  );
}
