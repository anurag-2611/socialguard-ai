import { useEffect, useState } from 'react';
import { MlError, ml } from '../api/ml';
import { Alert, Button, Card, Field, fmtDate, Input, PageHeader, Select, Spinner } from '../components/ui';
import { can, PERMISSIONS, ROLE_LABEL, ROLE_PERMISSIONS, ROLES, type Permission } from '../lib/permissions';
import type { ModelInfo } from '../lib/types';
import { currentUser, DEMO_USERS, resetDemoData, setThresholds, userName, useStore } from '../store/store';

type Tab = 'users' | 'audit' | 'model' | 'settings';
const TABS: { id: Tab; label: string; perm: Permission }[] = [
  { id: 'users', label: 'Users and roles', perm: 'users.manage' },
  { id: 'audit', label: 'Audit log', perm: 'audit.view' },
  { id: 'model', label: 'Model versions', perm: 'models.manage' },
  { id: 'settings', label: 'System settings', perm: 'config.manage' },
];

export function Admin() {
  const user = currentUser();
  const tabs = TABS.filter((t) => can(user?.role, t.perm));
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'users');
  return (
    <>
      <PageHeader title="Administration" />
      <div role="tablist" className="mb-4 flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t.id ? 'border-blue-700 font-semibold text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'model' && <ModelTab />}
      {tab === 'settings' && <SettingsTab />}
    </>
  );
}

function UsersTab() {
  const perms = Object.keys(PERMISSIONS) as Permission[];
  return (
    <div className="space-y-5">
      <Alert kind="info">User creation, editing and role assignment need the backend and are not available in demo mode. These are the four demo accounts.</Alert>
      <Card title="Users">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{DEMO_USERS.map((u) => (<tr key={u.id}><td className="py-2">{u.name}</td><td>{u.email}</td><td>{ROLE_LABEL[u.role]}</td></tr>))}</tbody>
        </table>
      </Card>
      <Card title="Role permission matrix">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500"><tr><th className="py-2">Permission</th>{ROLES.map((r) => <th key={r} className="px-2">{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {perms.map((p) => (
                <tr key={p}><td className="py-1.5"><span className="font-mono">{p}</span><span className="ml-2 text-slate-500">{PERMISSIONS[p]}</span></td>
                  {ROLES.map((r) => <td key={r} className="px-2">{ROLE_PERMISSIONS[r].includes(p) ? 'yes' : ''}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AuditTab() {
  const audit = useStore((s) => s.audit);
  const [action, setAction] = useState('');
  const actions = [...new Set(audit.map((a) => a.action))].sort();
  const rows = [...audit].reverse().filter((a) => !action || a.action === action);
  return (
    <Card title={`Audit log (${rows.length})`} action={<Select aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} className="!w-48"><option value="">All actions</option>{actions.map((a) => <option key={a}>{a}</option>)}</Select>}>
      {rows.length === 0 ? <p className="text-sm text-slate-500">No audit entries yet.</p> : (
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white text-slate-500"><tr><th className="py-2">Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => (<tr key={a.id}><td className="py-1.5 text-slate-500">{fmtDate(a.at)}</td><td>{a.actorId ? userName(a.actorId) : 'anonymous'}</td><td className="font-mono">{a.action}</td><td>{a.entity}</td><td className="text-slate-500">{a.detail}</td></tr>))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ModelTab() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    ml.modelInfo().then(setInfo).catch((e: unknown) => setError(e instanceof MlError ? e.message : 'Could not load model information.'));
  }, []);
  if (error) return <Alert>{error}</Alert>;
  if (!info) return <Spinner label="Loading model information" />;
  return (
    <div className="space-y-4">
      <Card title="Active model (read from the ML service)">
        <dl className="grid grid-cols-[12rem_1fr] gap-y-1 text-sm">
          <dt className="text-slate-500">Name / version</dt><dd>{info.model_name} / {info.model_version}</dd>
          <dt className="text-slate-500">Training dataset</dt><dd>{info.dataset_version} ({info.dataset_kind})</dd>
          <dt className="text-slate-500">Feature schema</dt><dd>{info.feature_schema_version}</dd>
          <dt className="text-slate-500">class_weight</dt><dd>{info.class_weight ?? 'none (decided by experiment)'}</dd>
          <dt className="text-slate-500">Trained</dt><dd>{fmtDate(info.trained_at)}</dd>
          <dt className="text-slate-500">Test ROC-AUC / PR-AUC / Brier</dt><dd>{['roc_auc', 'pr_auc', 'brier_score'].map((k) => info.test_metrics[k]?.toFixed(3)).join(' / ')}</dd>
        </dl>
      </Card>
      <Alert kind="warn">{info.caveat}</Alert>
      <p className="text-xs text-slate-500">Activating or retiring model versions needs the backend and is not available in demo mode.</p>
    </div>
  );
}

function SettingsTab() {
  const thresholds = useStore((s) => s.thresholds);
  const [low, setLow] = useState(String(thresholds.low));
  const [medium, setMedium] = useState(String(thresholds.medium));
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  return (
    <div className="space-y-5">
      <Card title="Risk thresholds">
        <p className="mb-3 text-xs text-slate-600">
          LOW below the first value, MEDIUM up to the second, HIGH at or above it. These are <strong>initial prototype values</strong> and must be
          validated on representative authorized data before operational use. Each analysis stores the thresholds it used.
        </p>
        <div className="grid max-w-md gap-4 sm:grid-cols-2">
          <Field label="LOW / MEDIUM boundary" htmlFor="t-low"><Input id="t-low" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} /></Field>
          <Field label="MEDIUM / HIGH boundary" htmlFor="t-med"><Input id="t-med" inputMode="decimal" value={medium} onChange={(e) => setMedium(e.target.value)} /></Field>
        </div>
        <div className="mt-3"><Button onClick={() => { const r = setThresholds({ low: Number(low), medium: Number(medium) }); setMsg(r.ok ? { kind: 'success', text: 'Thresholds saved for new analyses.' } : { kind: 'error', text: r.error }); }}>Save thresholds</Button></div>
        {msg && <div className="mt-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      </Card>
      <Card title="Demo data">
        <p className="mb-3 text-xs text-slate-600">Removes every analysis, case, report and audit entry stored in this browser. Thresholds are kept.</p>
        <Button variant="danger" onClick={() => { if (window.confirm('Delete all demo analyses, cases and reports in this browser?')) { resetDemoData(); setMsg({ kind: 'success', text: 'Demo data cleared.' }); } }}>Reset demo data</Button>
      </Card>
      <p className="text-xs text-slate-500">Retention policy and user management are part of the backend phase and are not active in demo mode.</p>
    </div>
  );
}
