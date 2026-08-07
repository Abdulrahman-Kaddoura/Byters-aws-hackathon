import { Redirect, Route, Switch } from 'wouter';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';

import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/pages/Dashboard';
import { CasesList } from '@/pages/CasesList';
import { NewCase } from '@/pages/NewCase';
import { CaseWorkspace } from '@/pages/CaseWorkspace';
import { PatientMode } from '@/pages/PatientMode';
import { KnowledgeBase } from '@/pages/KnowledgeBase';
import { CompletedCases } from '@/pages/CompletedCases';
import { Settings } from '@/pages/Settings';
import { AdminPanel } from '@/pages/admin/AdminPanel';
import { RequireAdmin } from '@/components/RequireAdmin';
import NotFound from '@/pages/not-found';

function App() {
  return (
    <TooltipProvider>
      <Switch>
        {/* Standalone, full-screen, no sidebar/topbar — a device handed to a
            patient has nothing else to navigate to. */}
        <Route path="/cases/:id/patient-mode/:conversationId?" component={PatientMode} />
        <Route>
          <AppLayout>
            <Switch>
              <Route path="/" component={() => <Redirect to="/dashboard" />} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/cases" component={CasesList} />
              <Route path="/cases/new" component={NewCase} />
              <Route path="/cases/:id/:tab?" component={CaseWorkspace} />
              <Route path="/completed" component={CompletedCases} />
              <Route path="/knowledge" component={KnowledgeBase} />
              <Route path="/settings" component={Settings} />
              <Route path="/admin/:tab?">
                <RequireAdmin>
                  <AdminPanel />
                </RequireAdmin>
              </Route>
              <Route component={NotFound} />
            </Switch>
          </AppLayout>
        </Route>
      </Switch>
      <Toaster position="top-center" richColors closeButton />
    </TooltipProvider>
  );
}

export default App;
