import { useState, type ReactNode } from 'react';
import { isSignedIn } from '../lib/auth';
import { Login } from '../pages/Login';

export function AuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => isSignedIn());

  if (!authed) return <Login onSignedIn={() => setAuthed(true)} />;
  return <>{children}</>;
}
