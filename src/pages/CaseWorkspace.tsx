import { useParams, useLocation } from 'wouter';
import { ArrowLeft, User, Stethoscope, FileText, Activity, FlaskConical, ClipboardCheck, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PatientAvatar } from '@/components/PatientAvatar';
import { StatusBadge, PriorityBadge } from '@/components/badges';
import { LoadingState } from '@/components/common';
import { useCase } from '@/hooks/useCases';
import { currentIdentity } from '@/lib/auth';

import { CaseOverview } from '@/tabs/CaseOverview';
import { CaseInterview } from '@/tabs/CaseInterview';
import { CaseExamination } from '@/tabs/CaseExamination';
import { CaseDifferential } from '@/tabs/CaseDifferential';
import { CaseTests } from '@/tabs/CaseTests';
import { CaseDiagnosis } from '@/tabs/CaseDiagnosis';
import { CaseTimeline } from '@/tabs/CaseTimeline';

const CLINICIAN_GROUPS = ['physician', 'admin', 'compliance'];

export function CaseWorkspace() {
  const params = useParams();
  const id = params.id!;
  const tab = params.tab || 'overview';
  const [, navigate] = useLocation();
  const { data: caseData, isLoading, error } = useCase(id);
  const isClinician = currentIdentity()?.groups.some((g) => CLINICIAN_GROUPS.includes(g)) ?? false;

  if (isLoading) {
    return (
      <div className="p-8">
        <LoadingState label="Loading case…" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <h2 className="mb-2 text-2xl font-bold">Case not found</h2>
        <p className="mb-4 text-muted-foreground">{error ? (error as Error).message : `The case ${id} does not exist or you don't have access.`}</p>
        <Button onClick={() => navigate('/cases')}>Return to Cases</Button>
      </div>
    );
  }

  const allTabs = [
    { id: 'overview', label: 'Overview', icon: User, clinicianOnly: false },
    { id: 'interview', label: 'Interview', icon: FileText, clinicianOnly: false },
    { id: 'examination', label: 'Examination', icon: Stethoscope, clinicianOnly: true },
    { id: 'differential', label: 'Differential', icon: Activity, clinicianOnly: true },
    { id: 'tests', label: 'Tests', icon: FlaskConical, clinicianOnly: true },
    { id: 'diagnosis', label: 'Diagnosis', icon: ClipboardCheck, clinicianOnly: true },
    { id: 'timeline', label: 'Timeline', icon: GitBranch, clinicianOnly: false },
  ];
  const tabs = allTabs.filter((t) => !t.clinicianOnly || isClinician);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="relative z-10 flex flex-shrink-0 items-center justify-between border-b bg-card px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={() => navigate('/cases')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <PatientAvatar name={caseData.patient.name} hue={caseData.patient.avatarHue} size={40} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight">{caseData.patient.name}</h1>
                <PriorityBadge priority={caseData.priority} />
                <StatusBadge status={caseData.status} />
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>
                  {caseData.patient.age}y &bull; {caseData.patient.gender}
                </span>
                <span>|</span>
                <span className="max-w-[320px] truncate">{caseData.chiefComplaint}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right text-sm">
            <div className="text-xs text-muted-foreground">Current Stage</div>
            <div className="font-medium capitalize text-primary">{caseData.stage}</div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 border-b bg-card px-6 pt-2">
        <Tabs value={tab} onValueChange={(v) => navigate(`/cases/${id}/${v}`)} className="w-full">
          <TabsList className="h-auto justify-start gap-6 bg-transparent p-0">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="rounded-none border-b-2 border-transparent px-0 py-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-auto bg-muted/20 p-6">
        <div className="mx-auto h-full max-w-5xl">
          {tab === 'overview' && <CaseOverview caseData={caseData} isClinician={isClinician} />}
          {tab === 'interview' && <CaseInterview caseData={caseData} />}
          {tab === 'examination' && isClinician && <CaseExamination caseData={caseData} />}
          {tab === 'differential' && isClinician && <CaseDifferential caseData={caseData} />}
          {tab === 'tests' && isClinician && <CaseTests caseData={caseData} />}
          {tab === 'diagnosis' && isClinician && <CaseDiagnosis caseData={caseData} />}
          {tab === 'timeline' && <CaseTimeline caseData={caseData} isClinician={isClinician} />}
        </div>
      </div>
    </div>
  );
}
