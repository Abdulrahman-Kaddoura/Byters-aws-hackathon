import { Redirect, Route, Switch, useLocation } from 'wouter';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';

import { AppLayout } from '@/components/layout/AppLayout';
import { CasesHub } from '@/pages/CasesHub';
import { CasesBrowser } from '@/pages/CasesBrowser';
import { NewCase } from '@/pages/NewCase';
import { CaseWorkspace } from '@/pages/CaseWorkspace';
import { PatientMode } from '@/pages/PatientMode';
import { KnowledgeBase } from '@/pages/KnowledgeBase';
import { Settings } from '@/pages/Settings';
import { AdminPanel } from '@/pages/admin/AdminPanel';
import { RequirePermission } from '@/components/RequirePermission';
import { SessionProvider, PERMISSIONS, useSession } from '@/lib/session';
import { kioskPath, useKioskLock } from '@/lib/kiosk';
import NotFound from '@/pages/not-found';

/**
 * While a patient-interview session is active, this is the only page that can
 * be reached.
 *
 * Patient Mode used to be "locked down" only in the sense of rendering no
 * sidebar — the patient is holding a device signed in as the *nurse*, so
 * typing a URL or pressing back exposed the entire caseload. The lock lives in
 * sessionStorage, so a refresh or a restored tab lands right back here, and
 * only the server-verified exit password clears it.
 */
function KioskGuard({ children }: { children: React.ReactNode }) {
  const lock = useKioskLock();
  const [location] = useLocation();

  if (lock) {
    const pinned = kioskPath(lock);
    if (location !== pinned) return <Redirect to={pinned} replace />;
  }
  return <>{children}</>;
}

/** Admins land in the panel; everyone else starts at the cases hub. */
function LandingRedirect() {
  const { role, can, isLoading } = useSession();
  if (isLoading) return null;
  if (role === 'admin' || can(PERMISSIONS.usersManage)) return <Redirect to="/admin" replace />;
  return <Redirect to="/cases" replace />;
}

function App() {
  return (
    <TooltipProvider>
      <SessionProvider>
        <KioskGuard>
          <Switch>
            {/* Standalone and full-screen: no topbar, nothing to navigate to. */}
            <Route path="/cases/:id/patient-mode/:conversationId?" component={PatientMode} />
            <Route>
              <AppLayout>
                <Switch>
                  <Route path="/" component={LandingRedirect} />
                  {/* Retired routes, kept as redirects so existing bookmarks
                      and links don't dead-end. */}
                  <Route path="/dashboard" component={() => <Redirect to="/cases" replace />} />
                  <Route
                    path="/completed"
                    component={() => <Redirect to="/cases/list/completed" replace />}
                  />

                  <Route path="/cases" component={CasesHub} />
                  <Route path="/cases/new">
                    <RequirePermission permission={PERMISSIONS.casesCreate}>
                      <NewCase />
                    </RequirePermission>
                  </Route>
                  {/* The filter is optional: CasesBrowser already falls back
                      to "active" without one. It has to be, because the
                      catch-all below would otherwise swallow a bare
                      /cases/list as a case whose id is "list" and spend the
                      page fetching GET /cases/list — a 404 loop behind an
                      empty workspace. Order matters here too: this must stay
                      above the :id route. */}
                  <Route path="/cases/list/:filter?" component={CasesBrowser} />
                  <Route path="/cases/:id/:tab?" component={CaseWorkspace} />

                  <Route path="/knowledge">
                    <RequirePermission permission={PERMISSIONS.resourcesManage}>
                      <KnowledgeBase />
                    </RequirePermission>
                  </Route>
                  <Route path="/settings" component={Settings} />
                  <Route path="/admin/:tab?">
                    <RequirePermission permission={PERMISSIONS.usersManage}>
                      <AdminPanel />
                    </RequirePermission>
                  </Route>
                  <Route component={NotFound} />
                </Switch>
              </AppLayout>
            </Route>
          </Switch>
        </KioskGuard>
      </SessionProvider>
      <Toaster position="top-center" richColors closeButton />
    </TooltipProvider>
  );
}

export default App;
