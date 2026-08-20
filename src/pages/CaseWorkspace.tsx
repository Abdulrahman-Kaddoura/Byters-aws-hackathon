import { useParams, useLocation } from 'wouter';
import {
  ArrowLeft,
  ClipboardCheck,
  FileText,
  FolderOpen,
  GitBranch,
  Stethoscope,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PatientAvatar } from '@/components/PatientAvatar';
import { StatusBadge, PriorityBadge } from '@/components/badges';
import { LoadingState } from '@/components/common';
import { useCase } from '@/hooks/useCases';
import { PERMISSIONS, useSession } from '@/lib/session';
import { AssignDoctor } from '@/components/AssignDoctor';
import { ConsultationPrompt } from '@/components/ConsultationPrompt';
import { TagEditor } from '@/components/TagEditor';

import { CaseOverview } from '@/tabs/CaseOverview';
import { CaseInterview } from '@/tabs/CaseInterview';
import { CaseWorkup } from '@/tabs/CaseWorkup';
import { CaseDiagnosis } from '@/tabs/CaseDiagnosis';
import { CaseDocuments } from '@/tabs/CaseDocuments';
import { CaseTimeline } from '@/tabs/CaseTimeline';

/**
 * Six tabs, down from eight.
 *
 * Nothing was removed — siblings were merged. Examination and Tests are one
 * workup; Differential and the final sign-off are one diagnosis; the follow-up
 * "Sessions" list belongs with the interview it extends. What a nurse sees is
 * decided by `cases.view_clinical`, which is also what the server uses to
 * decide which fields to send her in the first place, so the tab list and the
 * payload agree by construction.
 */
export function CaseWorkspace() {
  const params = useParams();
  const id = params.id!;
  const [, navigate] = useLocation();
  const { data: caseData, isLoading, error } = useCase(id);
  const { can, caseTags } = useSession();

  const clinical = can(PERMISSIONS.casesViewClinical);

  const allTabs = [
    { id: 'overview', label: 'Overview', icon: User, clinicalOnly: false },
    { id: 'interview', label: 'Interview', icon: FileText, clinicalOnly: true },
    { id: 'workup', label: 'Workup', icon: Stethoscope, clinicalOnly: true },
    { id: 'diagnosis', label: 'Diagnosis', icon: ClipboardCheck, clinicalOnly: true },
    { id: 'documents', label: 'Documents', icon: FolderOpen, clinicalOnly: false },
    { id: 'timeline', label: 'Timeline', icon: GitBranch, clinicalOnly: true },
  ];
  const tabs = allTabs.filter((t) => !t.clinicalOnly || clinical);
  const requested = params.tab || 'overview';
  // Deep-linking to a tab this account can't see lands on Overview rather than
  // an empty pane.
  const tab = tabs.some((t) => t.id === requested) ? requested : 'overview';

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
        <h2 className="mb-2 text-2xl font-bold">Case not available</h2>
        <p className="mb-4 max-w-md text-muted-foreground">
          {error
            ? (error as Error).message
            : `The case ${id} doesn't exist, or it isn't assigned to you.`}
        </p>
        <Button onClick={() => navigate('/cases')}>Back to cases</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="relative z-10 flex flex-shrink-0 flex-wrap items-center justify-between gap-4 border-b bg-card px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={() => navigate('/cases')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <PatientAvatar name={caseData.patient.name} hue={caseData.patient.avatarHue} size={40} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
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
          {clinical && <TagEditor caseId={id} tags={caseTags[id] ?? []} />}
          <AssignDoctor caseData={caseData} />
          <div className="text-right text-sm">
            <div className="text-xs text-muted-foreground">Current stage</div>
            <div className="font-medium capitalize text-primary">{caseData.stage}</div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 border-b bg-card px-6 pt-2">
        <Tabs value={tab} onValueChange={(v) => navigate(`/cases/${id}/${v}`)} className="w-full">
          <TabsList className="h-auto justify-start gap-6 overflow-x-auto bg-transparent p-0">
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

      {/* Asked once, before anything else: is there a recording of the doctor's
          own consultation? It has to come first because the summary, exams,
          tests and differential are all generated from it. */}
      {clinical && <ConsultationPrompt caseData={caseData} />}

      {/* max-w-5xl left a wide screen mostly empty on either side of a single
          column of cards. The tables and lists inside these tabs use the width
          they're given, so give them more of it. */}
      <div className="flex-1 overflow-auto bg-muted/20 px-4 py-5 sm:px-6">
        <div className="mx-auto h-full max-w-7xl">
          {tab === 'overview' && <CaseOverview caseData={caseData} isClinician={clinical} />}
          {tab === 'interview' && clinical && <CaseInterview caseData={caseData} />}
          {tab === 'workup' && clinical && <CaseWorkup caseData={caseData} />}
          {tab === 'diagnosis' && clinical && <CaseDiagnosis caseData={caseData} />}
          {tab === 'documents' && <CaseDocuments caseData={caseData} />}
          {tab === 'timeline' && clinical && (
            <CaseTimeline caseData={caseData} isClinician={clinical} />
          )}
        </div>
      </div>
    </div>
  );
}
