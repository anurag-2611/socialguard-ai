import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Field, Input } from '../components/ui';
import { ROLE_LABEL } from '../lib/permissions';
import { DEMO_PASSWORD, DEMO_USERS, login, useStore } from '../store/store';

export function Login() {
  const signedIn = useStore((s) => s.sessionUserId);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  if (signedIn) return <Navigate to="/" replace />;

  function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length === 0) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const result = login(email, password);
    if (!result.ok) return setErrors({ form: result.error });
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from !== '/login' ? from : '/', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <div className="flex flex-col justify-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">SocialGuard AI</h1>
          <p className="mt-2 text-sm text-slate-600">
            Risk assessment of suspicious or impersonating social-media profiles for authorized analysts.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-slate-600">
            <li>A score is a <strong>model signal, not proof</strong>.</li>
            <li>Every case is reviewed by a human before any report is filed.</li>
            <li>The system never acts on third-party accounts.</li>
          </ul>
        </div>

        <div className="space-y-4">
          <form onSubmit={submit} noValidate className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
            {errors.form && <Alert>{errors.form}</Alert>}
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password}>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full">Sign in</Button>
            <p className="text-center text-xs"><Link className="text-blue-700 hover:underline" to="/forgot-password">Forgot password?</Link></p>
          </form>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            <p className="font-semibold">Demo mode accounts (password: {DEMO_PASSWORD})</p>
            <p className="mt-1">Not real authentication. Pick a role to explore what each one can do.</p>
            <ul className="mt-2 space-y-1">
              {DEMO_USERS.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2">
                  <span>{ROLE_LABEL[u.role]}: {u.email}</span>
                  <button type="button" className="rounded border border-amber-300 bg-white px-2 py-0.5 hover:bg-amber-100" onClick={() => { setEmail(u.email); setPassword(DEMO_PASSWORD); }}>
                    Fill
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form
        noValidate
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
          setError(null);
          setSent(true);
        }}
      >
        <h1 className="text-lg font-semibold text-slate-900">Reset password</h1>
        {sent ? (
          <Alert kind="info">
            Password reset needs the backend and an email service, which are not connected in demo mode. No email was sent.
            In demo mode every account uses the password shown on the sign-in page.
          </Alert>
        ) : (
          <>
            <Field label="Email" htmlFor="reset-email" error={error}>
              <Input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full">Request reset</Button>
          </>
        )}
        <p className="text-center text-xs"><Link className="text-blue-700 hover:underline" to="/login">Back to sign in</Link></p>
      </form>
    </div>
  );
}
