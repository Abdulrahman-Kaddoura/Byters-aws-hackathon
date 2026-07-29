import { Redirect, Route, Switch } from 'wouter';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';

import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/pages/Dashboard';
import { CasesList } from '@/pages/CasesList';
import { NewCase } from '@/pages/NewCase';
import { CaseWorkspace } from '@/pages/CaseWorkspace';
import { KnowledgeBase } from '@/pages/KnowledgeBase';
import { CompletedCases } from '@/pages/CompletedCases';
import { Settings } from '@/pages/Settings';
import NotFound from '@/pages/not-found';

function App() {
  return (
    <TooltipProvider>
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
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
      <Toaster position="top-center" richColors closeButton />
    </TooltipProvider>
  );
}

export default App;
