import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MlError } from '../api/ml';
import { ContributionBars, Disclaimer, RiskMeter } from '../components/RiskViz';
import { Alert, Button, Card, EmptyState, Field, fmtDate, Input, PageHeader, pct, RiskBadge, Select, Spinner, Textarea } from '../components/ui';
import { can } from '../lib/permissions';
import { buildProfile, EMPTY_FORM, type FormErrors, type ProfileFormState } from '../lib/profileForm';
import { PLATFORM_LABEL, PLATFORMS, type Analysis, type Platform } from '../lib/types';
import { parseProfileUrl } from '../lib/url';
import { createCase, currentUser, runAnalysis, useStore } from '../store/store';

const SAMPLES: Record<'suspicious' | 'genuine', { platform: Platform; url: string; form: ProfileFormState }> = {
  suspicious: {
    platform: 'INSTAGRAM',
    url: 'https://instagram.com/acmebank_official1',
    form: { ...EMPTY_FORM, officialUsername: 'acmebank', accountAgeDays: '9', followers: '35', following: '1200', posts: '120', bio: 'official account giveaway dm to claim crypto', hasProfileImage: 'true', externalLink: 'true', imageSimilarity: '0.91' },
  },
  genuine: {
    platform: 'INSTAGRAM',
    url: 'https://instagram.com/mira.kowalski',
    form: { ...EMPTY_FORM, officialUsername: 'acmebank', accountAgeDays: '1500', followers: '820', following: '410', posts: '600', bio: 'photos and coffee', hasProfileImage: 'true', externalLink: 'false' },
  },
};

const TRI = [['', 'Unknown / not visible'], ['true', 'Yes'], ['false', 'No']] as const;

export function Analyze() {
  const user = currentUser();
  const analyses = useStore((s) => s.analyses);
  const cases = useStore((s) => s.cases);
  const [platform, setPlatform] = useState<Platform>('INSTAGRAM');
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ analysis: Analysis; caseNumber: string | null } | null>(null);

  const set = <K extends keyof ProfileFormState>(k: K, v: ProfileFormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    setResult(null);
    const parsed = parseProfileUrl(platform, url);
    setUrlError(parsed.ok ? null : parsed.error);
    if (!parsed.ok) return;
    const built = buildProfile(parsed.handle, form);
    setErrors(built.ok ? {} : built.errors);
    if (!built.ok) return;

    setBusy(true);
    try {
      const out = await runAnalysis({ platform, profileUrl: url.trim(), profile: built.profile });
      if (out.ok) setResult({ analysis: out.analysis, caseNumber: out.caseNumber });
      else setProblem(out.error);
    } catch (err) {
      setProblem(
        err instanceof MlError && err.kind === 'OFFLINE'
          ? `${err.message} Start it with: uvicorn app.main:app --port 8000 (inside ml-service, with a trained model).`
          : err instanceof Error ? err.message : 'Analysis failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  const loadSample = (key: 'suspicious' | 'genuine') => {
    const s = SAMPLES[key];
    setPlatform(s.platform); setUrl(s.url); setForm(s.form); setErrors({}); setUrlError(null); setResult(null);
  };

  const caseFor = result?.analysis.caseId ? cases.find((c) => c.id === result.analysis.caseId) : undefined;

  return (
    <>
      <PageHeader title="Analyze a profile" subtitle="Enter only information that is publicly visible. Leave a field blank if you could not see it: blank means UNAVAILABLE, not zero." />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <form onSubmit={submit} noValidate className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Demo samples (made-up values, not real accounts):</span>
            <Button type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => loadSample('suspicious')}>Suspicious-looking</Button>
            <Button type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => loadSample('genuine')}>Genuine-looking</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field label="Platform" htmlFor="platform">
              <Select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
              </Select>
            </Field>
            <Field label="Profile URL" htmlFor="url" error={urlError} hint="Must be on the platform's own domain.">
              <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://instagram.com/username" />
            </Field>
          </div>
          <Field label="Official account handle (optional)" htmlFor="official" error={errors.officialUsername} hint="The legitimate account this profile may be impersonating; enables name-similarity signals.">
            <Input id="official" value={form.officialUsername} onChange={(e) => set('officialUsername', e.target.value)} placeholder="acmebank" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account age (days)" htmlFor="age" error={errors.accountAgeDays}><Input id="age" inputMode="decimal" value={form.accountAgeDays} onChange={(e) => set('accountAgeDays', e.target.value)} /></Field>
            <Field label="Posts" htmlFor="posts" error={errors.posts}><Input id="posts" inputMode="numeric" value={form.posts} onChange={(e) => set('posts', e.target.value)} /></Field>
            <Field label="Followers" htmlFor="followers" error={errors.followers}><Input id="followers" inputMode="numeric" value={form.followers} onChange={(e) => set('followers', e.target.value)} /></Field>
            <Field label="Following" htmlFor="following" error={errors.following}><Input id="following" inputMode="numeric" value={form.following} onChange={(e) => set('following', e.target.value)} /></Field>
          </div>
          <Field label="Bio text" htmlFor="bio" error={errors.bio}><Textarea id="bio" rows={2} value={form.bio} onChange={(e) => set('bio', e.target.value)} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            {([['hasProfileImage', 'Has profile image'], ['externalLink', 'Link in bio'], ['verified', 'Verified badge']] as const).map(([key, label]) => (
              <Field key={key} label={label} htmlFor={key}>
                <Select id={key} value={form[key]} onChange={(e) => set(key, e.target.value as ProfileFormState[typeof key])}>
                  {TRI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Image similarity to official (0 to 1)" htmlFor="imgsim" error={errors.imageSimilarity} hint="From a perceptual-hash comparison you computed."><Input id="imgsim" inputMode="decimal" value={form.imageSimilarity} onChange={(e) => set('imageSimilarity', e.target.value)} /></Field>
            <Field label="Repeated-content ratio (0 to 1)" htmlFor="rep" error={errors.repeatedContent}><Input id="rep" inputMode="decimal" value={form.repeatedContent} onChange={(e) => set('repeatedContent', e.target.value)} /></Field>
          </div>
          {problem && <Alert>{problem}</Alert>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy || !can(user?.role, 'profiles.analyze')}>Analyze profile</Button>
            {busy && <Spinner label="Scoring with the ML service" />}
          </div>
        </form>

        <div className="space-y-4">
          {!result ? (
            <EmptyState title="No result yet" text="The risk score, the reasons behind it and the model version appear here after you run an analysis." />
          ) : (
            <>
              <Card title="Risk assessment">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-4xl font-semibold tabular-nums text-slate-900">{pct(result.analysis.result.risk_probability)}</p>
                    <p className="text-xs text-slate-500">estimated probability of suspicious</p>
                  </div>
                  <RiskBadge level={result.analysis.riskLevel} />
                </div>
                <div className="mt-4"><RiskMeter probability={result.analysis.result.risk_probability} thresholds={result.analysis.thresholdsSnapshot} /></div>
                <p className="mt-3 text-xs text-slate-500">
                  {PLATFORM_LABEL[result.analysis.platform]} @{result.analysis.profile.username} - analyzed {fmtDate(result.analysis.createdAt)}
                </p>
              </Card>
              <Card title="Why the model scored it this way">
                <ContributionBars items={result.analysis.result.contributions} />
                {result.analysis.result.unavailable_fields.length > 0 && (
                  <p className="mt-3 text-xs text-slate-600"><strong>Unavailable inputs:</strong> {result.analysis.result.unavailable_fields.join(', ')}</p>
                )}
                <p className="mt-3 text-[11px] text-slate-500">
                  {result.analysis.result.model_name} {result.analysis.result.model_version} - dataset {result.analysis.result.dataset_version} - schema {result.analysis.result.feature_schema_version}
                </p>
              </Card>
              <Disclaimer />
              {caseFor ? (
                <Alert kind="success">Case <Link className="font-semibold underline" to={`/cases/${caseFor.id}`}>{caseFor.caseNumber}</Link> {result.caseNumber ? 'was created automatically (high risk).' : 'exists for this analysis.'}</Alert>
              ) : can(user?.role, 'cases.create') ? (
                <Button variant="secondary" onClick={async () => { const r = await createCase(result.analysis.id); if (r.ok) setResult({ analysis: { ...result.analysis, caseId: r.record.id }, caseNumber: null }); }}>Create a case for this profile</Button>
              ) : null}
            </>
          )}
        </div>
      </div>

      <Card title="Recent analyses" className="mt-5">
        {analyses.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing analyzed yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Profile</th><th>Platform</th><th>Risk</th><th>When</th><th>Case</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {analyses.slice(0, 6).map((a) => {
                const c = cases.find((x) => x.id === a.caseId);
                return (
                  <tr key={a.id}>
                    <td className="py-2">@{a.profile.username}</td>
                    <td>{PLATFORM_LABEL[a.platform]}</td>
                    <td><span className="inline-flex items-center gap-2"><RiskBadge level={a.riskLevel} /><span className="text-xs text-slate-500">{pct(a.result.risk_probability)}</span></span></td>
                    <td className="text-slate-500">{fmtDate(a.createdAt)}</td>
                    <td>{c ? <Link className="text-blue-700 hover:underline" to={`/cases/${c.id}`}>{c.caseNumber}</Link> : <span className="text-slate-400">none</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
