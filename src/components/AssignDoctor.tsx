import { useState } from 'react';
import { Loader2, UserCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { useAssignCase, useDoctorList } from '@/hooks/useCases';
import { PERMISSIONS, useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PatientCase } from '@/types';

/**
 * Routing a case to a doctor. This is the moment access is granted: until a
 * case is assigned, no doctor can open it at all.
 *
 * Only shown to callers with `cases.assign` (nurses and admins) — the server
 * enforces the same rule, so a doctor cannot quietly hand their case to a
 * colleague.
 */
export function AssignDoctor({ caseData }: { caseData: PatientCase }) {
  const { can } = useSession();
  const mayAssign = can(PERMISSIONS.casesAssign);

  const { data: doctors = [], isLoading } = useDoctorList(mayAssign);
  const assign = useAssignCase(caseData.id);
  const [choice, setChoice] = useState('');

  const assigned = doctors.find((d) => d.sub === caseData.assignedPhysicianId);

  if (!mayAssign) {
    // Doctors just see who owns it, without the controls.
    if (!caseData.assignedPhysicianId) return null;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserCheck className="h-3.5 w-3.5" /> Assigned
      </span>
    );
  }

  async function submit() {
    if (!choice) return;
    try {
      await assign.mutateAsync(choice);
      const name = doctors.find((d) => d.sub === choice)?.name ?? 'the doctor';
      toast.success(`Case assigned to ${name}.`);
      setChoice('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not assign this case.');
    }
  }

  return (
    <div className="flex items-center gap-2">
      {assigned && (
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
          <UserCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          {assigned.name}
        </span>
      )}

      <Select value={choice} onValueChange={setChoice} disabled={isLoading || assign.isPending}>
        <SelectTrigger className="h-9 w-[190px]">
          <SelectValue placeholder={assigned ? 'Reassign to…' : 'Assign to a doctor…'} />
        </SelectTrigger>
        <SelectContent>
          {doctors.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No doctors available
            </div>
          ) : (
            doctors.map((d) => (
              <SelectItem key={d.sub} value={d.sub}>
                {d.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      <Button
        size="sm"
        onClick={submit}
        disabled={!choice || choice === caseData.assignedPhysicianId || assign.isPending}
      >
        {assign.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
        <span className="ml-1.5 hidden sm:inline">{assigned ? 'Reassign' : 'Assign'}</span>
      </Button>
    </div>
  );
}
