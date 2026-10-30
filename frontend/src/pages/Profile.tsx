import { Card, PageHeader } from '../components/ui';
import { PERMISSIONS, ROLE_LABEL, ROLE_PERMISSIONS } from '../lib/permissions';
import { currentUser } from '../store/store';

export function Profile() {
  const user = currentUser();
  if (!user) return null;
  return (
    <>
      <PageHeader title="My profile" />
      <Card title="Account">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt className="text-slate-500">Name</dt><dd>{user.name}</dd>
          <dt className="text-slate-500">Email</dt><dd>{user.email}</dd>
          <dt className="text-slate-500">Role</dt><dd>{ROLE_LABEL[user.role]}</dd>
        </dl>
      </Card>
      <Card title="What this role can do" className="mt-5">
        <ul className="space-y-1 text-sm">
          {ROLE_PERMISSIONS[user.role].map((p) => (<li key={p}><span className="font-mono text-xs text-slate-500">{p}</span> {PERMISSIONS[p]}</li>))}
        </ul>
      </Card>
    </>
  );
}
