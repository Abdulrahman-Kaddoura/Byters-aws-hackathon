import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Lock, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import * as api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNote, LoadingState, SectionHeading } from '@/components/common';

const MIN_LENGTH = 4;
const SETTINGS_KEY = ['admin-settings'] as const;

/**
 * Hospital-wide settings. Currently just the one: the password that unlocks
 * patient-interview mode.
 *
 * The password is stored as a PBKDF2 hash and can only ever be replaced, never
 * read back — so there is nothing here to reveal, only to set.
 */
export function AdminSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: api.adminGetSettings,
  });

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const save = useMutation({
    mutationFn: (value: string) => api.adminSetKioskPassword(value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      setPassword('');
      setConfirm('');
      toast.success('Exit password updated.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save.'),
  });

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSave = password.length >= MIN_LENGTH && password === confirm && !save.isPending;

  if (isLoading) return <LoadingState label="Loading settings…" />;

  return (
    <div className="max-w-xl space-y-4 pt-2">
      {error && <ErrorNote>{(error as Error).message}</ErrorNote>}

      <Card>
        <CardContent className="space-y-5 p-6">
          <SectionHeading
            title="Patient interview exit password"
            subtitle="Staff enter this to unlock a device after a patient has finished their interview. One password for the whole hospital."
            icon={<Lock className="h-4 w-4" />}
          />

          {data?.kioskExitPasswordSet ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                A password is set
                {data.updatedBy ? ` (last changed by ${data.updatedBy})` : ''}. It can't be shown —
                only replaced.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                No password set yet. Until one exists, a device handed to a patient locks with no
                way to unlock it.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>New exit password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${MIN_LENGTH} characters`}
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Confirm</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Type it again"
              autoComplete="new-password"
            />
            {mismatch && <p className="text-xs text-destructive">The two entries don't match.</p>}
          </div>

          <Button onClick={() => save.mutate(password)} disabled={!canSave}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {data?.kioskExitPasswordSet ? 'Replace password' : 'Set password'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
