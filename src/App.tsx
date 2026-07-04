import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { Intake } from './pages/Intake';
import { Cases } from './pages/Cases';
import { Completed } from './pages/Completed';
import { Knowledge } from './pages/Knowledge';
import { Settings } from './pages/Settings';
import { NotFound } from './pages/NotFound';
import { CaseLayout } from './pages/case/CaseLayout';
import { Overview } from './pages/case/Overview';
import { Interview } from './pages/case/Interview';
import { Examination } from './pages/case/Examination';
import { Differential } from './pages/case/Differential';
import { Tests } from './pages/case/Tests';
import { FinalDiagnosis } from './pages/case/FinalDiagnosis';
import { TimelineTab } from './pages/case/TimelineTab';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="intake" element={<Intake />} />
        <Route path="cases" element={<Cases />} />
        <Route path="completed" element={<Completed />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="settings" element={<Settings />} />
        <Route path="cases/:id" element={<CaseLayout />}>
          <Route index element={<Overview />} />
          <Route path="interview" element={<Interview />} />
          <Route path="examination" element={<Examination />} />
          <Route path="differential" element={<Differential />} />
          <Route path="tests" element={<Tests />} />
          <Route path="diagnosis" element={<FinalDiagnosis />} />
          <Route path="timeline" element={<TimelineTab />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
