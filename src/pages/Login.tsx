import { useState, type FormEvent } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import {
  AuthError,
  NewPasswordRequired,
  completeNewPassword,
  confirmForgotPassword,
  describeAuthError,
  forgotPassword,
  signIn,
} from '../lib/auth';
import { PasswordField, PasswordRequirements } from '../components/PasswordField';
import { isPasswordValid } from '../lib/passwordPolicy';

type Mode = 'signin' | 'forgot' | 'reset';

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [challenge, setChallenge] = useState<NewPasswordRequired | null>(null);

  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [codeDestination, setCodeDestination] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitSignIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
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
        setError(describeAuthError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { destination } = await forgotPassword(username);
      setCodeDestination(destination ?? null);
      setMode('reset');
    } catch (err) {
      if (err instanceof AuthError && err.code === 'UserNotFoundException') {
        // Don't reveal whether the account exists — proceed as if a code was sent.
        setCodeDestination(null);
        setMode('reset');
      } else {
        setError(describeAuthError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await confirmForgotPassword(username, resetCode, resetPassword);
      setResetCode('');
      setResetPassword('');
      setResetConfirm('');
      setCodeDestination(null);
      setMode('signin');
      setInfo('Password updated. Sign in with your new password.');
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { destination } = await forgotPassword(username);
      setCodeDestination(destination ?? null);
      setInfo('A new code has been sent.');
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  function backToSignIn() {
    setMode('signin');
    setChallenge(null);
    setError(null);
    setInfo(null);
    setResetCode('');
    setResetPassword('');
    setResetConfirm('');
  }

  const resetValid =
    isPasswordValid(resetPassword) && resetPassword === resetConfirm && resetCode.length > 0;

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

        {mode === 'signin' && (
          <form onSubmit={submitSignIn} className="space-y-3">
            {!challenge && (
              <>
                <Field label="Email or username" value={username} onChange={setUsername} autoFocus />
                <PasswordField
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                />
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setError(null);
                      setInfo(null);
                    }}
                    className="text-[12px] font-medium text-brand-600 hover:underline dark:text-brand-300"
                  >
                    Forgot password?
                  </button>
                </div>
              </>
            )}
            {challenge && (
              <>
                <PasswordField
                  label="New password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoFocus
                  autoComplete="new-password"
                />
                <PasswordRequirements password={newPassword} />
              </>
            )}

            {error && <ErrorBanner message={error} />}
            {info && <InfoBanner message={info} />}

            <button
              type="submit"
              disabled={busy || (!!challenge && !isPasswordValid(newPassword))}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {challenge ? 'Set password & continue' : 'Sign in'}
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={submitForgot} className="space-y-3">
            <p className="text-[13px] text-secondary">
              Enter your email or username and we'll send you a code to reset your password.
            </p>
            <Field label="Email or username" value={username} onChange={setUsername} autoFocus />

            {error && <ErrorBanner message={error} />}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Send reset code
            </button>
            <button
              type="button"
              onClick={backToSignIn}
              className="w-full text-center text-[13px] font-medium text-secondary hover:text-[var(--text)]"
            >
              Back to sign in
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={submitReset} className="space-y-3">
            <p className="text-[13px] text-secondary">
              Enter the code sent to {codeDestination ?? 'your email'}, then choose a new password.
            </p>
            <Field label="Reset code" value={resetCode} onChange={setResetCode} autoFocus inputMode="numeric" />
            <PasswordField
              label="New password"
              value={resetPassword}
              onChange={setResetPassword}
              autoComplete="new-password"
            />
            <PasswordRequirements password={resetPassword} />
            <PasswordField
              label="Confirm new password"
              value={resetConfirm}
              onChange={setResetConfirm}
              autoComplete="new-password"
            />
            {resetConfirm.length > 0 && resetConfirm !== resetPassword && (
              <p className="text-[12px] text-rose-600 dark:text-rose-400">Passwords don&apos;t match.</p>
            )}

            {error && <ErrorBanner message={error} />}
            {info && <InfoBanner message={info} />}

            <button
              type="submit"
              disabled={busy || !resetValid}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Reset password
            </button>
            <div className="flex items-center justify-between text-[13px]">
              <button
                type="button"
                onClick={resendCode}
                disabled={busy}
                className="font-medium text-brand-600 hover:underline disabled:opacity-60 dark:text-brand-300"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={backToSignIn}
                className="font-medium text-secondary hover:text-[var(--text)]"
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-rose-200/70 bg-rose-50/60 px-3 py-2 text-[13px] text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
      {message}
    </p>
  );
}

function InfoBanner({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2 text-[13px] text-secondary">
      {message}
    </p>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoFocus,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoFocus?: boolean;
  inputMode?: 'text' | 'numeric';
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-secondary">{label}</span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
      />
    </label>
  );
}
