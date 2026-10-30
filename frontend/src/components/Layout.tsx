import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ml, type MlHealth } from '../api/ml';
import { can, ROLE_LABEL, type Permission } from '../lib/permissions';
import { currentUser, logout, useStore } from '../store/store';
import { cx } from './ui';

const NAV: { to: string; label: string; any: Permission[] }[] = [
  { to: '/', label: 'Dashboard', any: ['analytics.view'] },
  { to: '/analyze', label: 'Analyze profile', any: ['profiles.analyze'] },
  { to: '/cases', label: 'Cases', any: ['cases.view'] },
  { to: '/reports', label: 'Reports', any: ['reports.view'] },
  { to: '/admin', label: 'Administration', any: ['users.manage', 'audit.view', 'config.manage', 'models.manage'] },
  { to: '/profile', label: 'My profile', any: [] },
];

export function useMlStatus(): { health: MlHealth | null; offline: boolean } {
  const [health, setHealth] = useState<MlHealth | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () =>
      ml
        .health()
        .then((h) => alive && (setHealth(h), setOffline(false)))
        .catch(() => alive && (setHealth(null), setOffline(true)));
    void check();
    const t = setInterval(check, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return { health, offline };
}

export function RequireAuth() {
  const userId = useStore((s) => s.sessionUserId);
  const location = useLocation();
  if (!userId) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Shell />;
}

export function RequirePermission({ any, children }: { any: Permission[]; children: React.ReactNode }) {
  const user = currentUser();
  if (!user || !any.some((p) => can(user.role, p))) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-semibold text-slate-800">Access denied</p>
        <p className="mt-1 text-sm text-slate-500">Your role does not have permission to open this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}

function Shell() {
  const user = currentUser();
  const navigate = useNavigate();
  const { health, offline } = useMlStatus();
  if (!user) return null;
  const items = NAV.filter((n) => n.any.length === 0 || n.any.some((p) => can(user.role, p)));

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 text-slate-200 print:hidden">
        <div className="px-5 py-5">
          <p className="text-base font-semibold tracking-tight text-white">SocialGuard AI</p>
          <p className="text-xs text-slate-400">Risk assessment workspace</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cx('block rounded-md px-3 py-2 text-sm', isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800')
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-4 text-xs">
          <p className="font-medium text-white">{user.name}</p>
          <p className="text-slate-400">{ROLE_LABEL[user.role]}</p>
          <button
            className="mt-3 w-full rounded-md border border-slate-600 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900 print:hidden">
          <strong>Demo mode:</strong> sign-in, cases and reports are stored in this browser only. The backend is not connected yet.
        </div>
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 py-2 text-xs print:hidden">
          <span className="text-slate-500">ML service</span>
          {health?.model_loaded ? (
            <span className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200">online, model loaded</span>
          ) : health ? (
            <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200">online, no model</span>
          ) : (
            <span className="rounded bg-red-50 px-2 py-0.5 font-medium text-red-700 ring-1 ring-red-200">{offline ? 'offline' : 'checking'}</span>
          )}
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
