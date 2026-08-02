import { useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useSubmitIntake } from '@/hooks/useCases';
import type { Gender } from '@/types';

const GENDERS: Gender[] = ['Male', 'Female', 'Other'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

interface FormState {
  name: string;
  age: string;
  gender: Gender | '';
  weight: string;
  height: string;
  bloodType: string;
  occupation: string;
}

const EMPTY: FormState = { name: '', age: '', gender: '', weight: '', height: '', bloodType: '', occupation: '' };

/**
 * Staff enter the patient's full record here, then hand the device to the
 * patient — symptoms, history, and chief complaint are still gathered by the
 * AI interview itself, not this form.
 */
export function NewCase() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const submitIntake = useSubmitIntake();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const age = Number(form.age);
  const isComplete =
    form.name.trim() &&
    form.age.trim() &&
    Number.isFinite(age) &&
    age > 0 &&
    form.gender &&
    form.weight.trim() &&
    form.height.trim() &&
    form.bloodType &&
    form.occupation.trim();

  async function submit() {
    setError(null);
    try {
      const created = await submitIntake.mutateAsync({
        patient: {
          name: form.name.trim(),
          age,
          gender: form.gender,
          weight: form.weight.trim(),
          height: form.height.trim(),
          bloodType: form.bloodType,
          occupation: form.occupation.trim(),
        },
      });
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
          <p className="mt-1 text-muted-foreground">Enter the patient's info, then hand them the device.</p>
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
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Elena Torres" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Age</Label>
              <Input
                type="number"
                min={0}
                value={form.age}
                onChange={(e) => set('age', e.target.value)}
                placeholder="e.g. 54"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => set('gender', v as Gender)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Weight</Label>
              <Input value={form.weight} onChange={(e) => set('weight', e.target.value)} placeholder="e.g. 82 kg" />
            </div>
            <div className="space-y-1.5">
              <Label>Height</Label>
              <Input value={form.height} onChange={(e) => set('height', e.target.value)} placeholder="e.g. 178 cm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Blood type</Label>
              <Select value={form.bloodType} onValueChange={(v) => set('bloodType', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {BLOOD_TYPES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Occupation</Label>
              <Input value={form.occupation} onChange={(e) => set('occupation', e.target.value)} placeholder="e.g. Teacher" />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}

          <Button onClick={submit} disabled={submitIntake.isPending || !isComplete} className="w-full">
            {submitIntake.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Start AI interview
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
