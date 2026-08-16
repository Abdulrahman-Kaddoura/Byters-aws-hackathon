import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { isSignedIn, onSignOut } from '@/lib/auth';
import { clearKioskLock } from '@/lib/kiosk';
import { Login } from '@/pages/Login';

export function AuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => isSignedIn());
  const queryClient = useQueryClient();

  // Sign-out can come from anywhere — the topbar, a 401 in lib/api, a refresh
  // token that no longer works. Previously nothing here noticed, so the app
  // shell stayed mounted over a dead session.
  useEffect(
    () =>
      onSignOut(() => {
        // The next person to sign in on this device must not inherit the last
        // one's cached cases, permissions, or a half-finished kiosk session.
        queryClient.clear();
        clearKioskLock();
        setAuthed(false);
      }),
    [queryClient]
  );

  if (!authed) return <Login onSignedIn={() => setAuthed(true)} />;
  return <>{children}</>;
}
