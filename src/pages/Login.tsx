import { useState, type FormEvent } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { NewPasswordRequired, completeNewPassword, signIn } from '../lib/auth';

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [challenge, setChallenge] = useState<NewPasswordRequired | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (challenge) {
        await completeNewPassword(challenge, newPassword);
      } else {
        await signIn(username, password);
      }
      onSignedIn();
    } catch (err) {
      if (err instanceof NewPasswordRequired) {
        setChallenge(err);
        setError('This account needs a new password before first use.');
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
            <Activity className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Aura</h1>
            <p className="text-xs text-muted">Clinical Decision Support</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {!challenge && (
            <>
              <Field label="Email or username" value={username} onChange={setUsername} autoFocus />
              <Field label="Password" type="password" value={password} onChange={setPassword} />
            </>
          )}
          {challenge && (
            <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} autoFocus />
          )}

          {error && (
            <p className="rounded-lg border border-rose-200/70 bg-rose-50/60 px-3 py-2 text-[13px] text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {challenge ? 'Set password & continue' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-secondary">{label}</span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
    </label>
  );
}
