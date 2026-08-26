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
} from '@/lib/auth';
import { PasswordField, PasswordRequirements } from '@/components/PasswordField';
import { isPasswordValid } from '@/lib/passwordPolicy';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

  const resetValid = isPasswordValid(resetPassword) && resetPassword === resetConfirm && resetCode.length > 0;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-sidebar px-4 text-sidebar-foreground">
      <Card className="w-full max-w-sm shadow-2xl">
        <CardContent className="p-6">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Activity className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold tracking-tight">Sehati</h1>
            <p className="text-xs text-muted-foreground">Clinical AI Decision Support</p>
          </div>

          {mode === 'signin' && (
            <form onSubmit={submitSignIn} className="space-y-3">
              {!challenge && (
                <>
                  <div className="space-y-1.5">
                    <Label>Email or username</Label>
                    <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
                  </div>
                  <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError(null);
                        setInfo(null);
                      }}
                      className="text-[12px] font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                </>
              )}
              {challenge && (
                <>
                  <PasswordField label="New password" value={newPassword} onChange={setNewPassword} autoFocus autoComplete="new-password" />
                  <PasswordRequirements password={newPassword} />
                </>
              )}

              {error && <ErrorBanner message={error} />}
              {info && <InfoBanner message={info} />}

              <Button type="submit" className="w-full" disabled={busy || (!!challenge && !isPasswordValid(newPassword))}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {challenge ? 'Set password & continue' : 'Sign in to workspace'}
              </Button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={submitForgot} className="space-y-3">
              <p className="text-[13px] text-muted-foreground">Enter your email or username and we'll send you a code to reset your password.</p>
              <div className="space-y-1.5">
                <Label>Email or username</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
              </div>

              {error && <ErrorBanner message={error} />}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Send reset code
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={backToSignIn}>
                Back to sign in
              </Button>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={submitReset} className="space-y-3">
              <p className="text-[13px] text-muted-foreground">Enter the code sent to {codeDestination ?? 'your email'}, then choose a new password.</p>
              <div className="space-y-1.5">
                <Label>Reset code</Label>
                <Input value={resetCode} onChange={(e) => setResetCode(e.target.value)} autoFocus inputMode="numeric" required />
              </div>
              <PasswordField label="New password" value={resetPassword} onChange={setResetPassword} autoComplete="new-password" />
              <PasswordRequirements password={resetPassword} />
              <PasswordField label="Confirm new password" value={resetConfirm} onChange={setResetConfirm} autoComplete="new-password" />
              {resetConfirm.length > 0 && resetConfirm !== resetPassword && <p className="text-[12px] text-rose-600 dark:text-rose-400">Passwords don't match.</p>}

              {error && <ErrorBanner message={error} />}
              {info && <InfoBanner message={info} />}

              <Button type="submit" className="w-full" disabled={busy || !resetValid}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Reset password
              </Button>
              <div className="flex items-center justify-between text-[13px]">
                <button type="button" onClick={resendCode} disabled={busy} className="font-medium text-primary hover:underline disabled:opacity-60">
                  Resend code
                </button>
                <button type="button" onClick={backToSignIn} className="font-medium text-muted-foreground hover:text-foreground">
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center text-xs text-muted-foreground">
            <p>For authorized clinical personnel only.</p>
            <p className="mt-1">Access is logged and monitored.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">{message}</p>;
}

function InfoBanner({ message }: { message: string }) {
  return <p className="rounded-lg border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">{message}</p>;
}
