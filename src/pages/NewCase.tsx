import { useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSubmitIntake } from '@/hooks/useCases';

/**
 * Staff enter just the patient's name here, then hand the device to the
 * patient — everything else (symptoms, history, complaint) is gathered by
 * the AI interview itself, not a form.
 */
export function NewCase() {
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submitIntake = useSubmitIntake();

  async function submit() {
    setError(null);
    try {
      const created = await submitIntake.mutateAsync({ patient: { name } });
      navigate(`/cases/${created.id}/patient-mode`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-8 p-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Patient Case</h1>
          <p className="mt-1 text-muted-foreground">Enter the patient's name, then hand them the device.</p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-2.5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-[13px] text-muted-foreground">
                SEHATI will conduct the entire intake conversationally — symptoms, history, and everything else — directly with the
                patient, then generate a structured clinical summary for you to review.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Patient's full name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Elena Torres"
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && submit()}
              autoFocus
            />
          </div>

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}

          <Button onClick={submit} disabled={submitIntake.isPending || !name.trim()} className="w-full">
            {submitIntake.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Start AI interview
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
