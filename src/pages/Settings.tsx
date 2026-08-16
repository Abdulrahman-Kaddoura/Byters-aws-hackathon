import { useLocation } from 'wouter';
import { User, Shield, Moon, Sun, LogOut } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '@/components/common';
import { signOut } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { PatientAvatar } from '@/components/PatientAvatar';
import { config } from '@/lib/config';

export function Settings() {
  // From /me rather than the JWT, so the role shown here is the one the
  // server actually applies.
  const { me, role } = useSession();
  const { mode, toggle } = useTheme();
  const [, navigate] = useLocation();

  const displayName = me?.name || me?.email || me?.username || 'Signed in user';

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
        <p className="mt-1 text-muted-foreground">Your Aura platform identity and session.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <SectionHeading icon={<User className="h-[18px] w-[18px]" />} title="Profile" subtitle="From your Cognito sign-in — not editable here" />
          <div className="mt-5 flex items-center gap-4">
            <PatientAvatar name={displayName} size={64} />
            <div>
              <p className="text-lg font-semibold">{displayName}</p>
              <p className="text-sm capitalize text-muted-foreground">{role ?? 'No role assigned'}</p>
            </div>
          </div>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Username</dt>
              <dd className="text-sm font-medium">{me?.username ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Cognito subject</dt>
              <dd className="truncate text-sm font-medium">{me?.sub ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Region</dt>
              <dd className="text-sm font-medium">{config.region}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <SectionHeading icon={<Sun className="h-[18px] w-[18px]" />} title="Appearance" subtitle="Switch between light and dark mode" />
          <Button variant="outline" className="mt-4" onClick={toggle}>
            {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Switch to {mode === 'dark' ? 'light' : 'dark'} mode
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <SectionHeading icon={<Shield className="h-[18px] w-[18px]" />} title="Session" subtitle="Signing out clears your local session and returns you to the sign-in screen" />
          <Button
            variant="destructive"
            className="mt-4"
            onClick={() => {
              signOut();
              navigate('/');
              window.location.reload();
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
