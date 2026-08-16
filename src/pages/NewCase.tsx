import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Activity, ArrowLeft, Loader2, Sparkles, TriangleAlert, UserRound } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ErrorNote, SectionHeading } from '@/components/common';
import { useSubmitIntake } from '@/hooks/useCases';
import { setKioskLock } from '@/lib/kiosk';
import * as api from '@/lib/api';
import type { Gender, Vitals } from '@/types';

const GENDERS: Gender[] = ['Male', 'Female', 'Other'];

interface FormState {
  name: string;
  age: string;
  gender: Gender | '';
  height: string;
  weight: string;
  bloodPressure: string;
  heartRate: string;
  temperature: string;
  oxygenSaturation: string;
}

const EMPTY: FormState = {
  name: '',
  age: '',
  gender: '',
  height: '',
  weight: '',
  bloodPressure: '',
  heartRate: '',
  temperature: '',
  oxygenSaturation: '',
};

/**
 * The nurse's admission form.
 *
 * Identity and measured vitals only. Symptoms, history and the chief complaint
 * are the AI interview's job, so asking for them here would mean asking the
 * patient twice. Vitals are optional — a nurse may not have every reading, and
 * blocking admission on a missing SpO₂ helps nobody.
 */
export function NewCase() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [kioskReady, setKioskReady] = useState<boolean | null>(null);
  const submitIntake = useSubmitIntake();

  // If no exit password has been set, the device would lock with no way out.
  // Better to warn here than after the patient is holding it.
  useEffect(() => {
    api
      .kioskStatus()
      .then((s) => setKioskReady(s.kioskExitPasswordSet))
      .catch(() => setKioskReady(null));
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const age = Number(form.age);
  const isComplete = Boolean(
    form.name.trim() && form.age.trim() && Number.isFinite(age) && age > 0 && form.gender
  );

  /** Keyed to match the `Vitals` type the rest of the app already renders
   * (types.ts), with the unit baked into the string as it displays. */
  function vitals(): Vitals {
    const out: Vitals = {};
    if (form.bloodPressure.trim()) out.bp = form.bloodPressure.trim();
    if (form.heartRate.trim()) out.hr = `${form.heartRate.trim()} bpm`;
    if (form.temperature.trim()) out.temp = `${form.temperature.trim()}°C`;
    if (form.oxygenSaturation.trim()) out.spo2 = `${form.oxygenSaturation.trim()}%`;
    return out;
  }

  async function submit() {
    setError(null);
    try {
      const created = await submitIntake.mutateAsync({
        patient: {
          name: form.name.trim(),
          age,
          gender: form.gender,
          height: form.height.trim(),
          weight: form.weight.trim(),
        },
        vitals: vitals(),
      });
      // Lock before navigating, so the device is already pinned by the time the
      // patient sees the first question.
      setKioskLock(created.id);
      navigate(`/cases/${created.id}/patient-mode`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6 sm:p-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/cases')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admit a patient</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Record their details, then hand them the device.
          </p>
        </div>
      </div>

      {kioskReady === false && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            No interview exit password has been set yet. Once you hand the device over, the screen
            locks and cannot be unlocked. Ask an administrator to set one before continuing.
          </p>
        </div>
      )}

      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-2.5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-[13px] text-muted-foreground">
                SEHATI asks the patient about their symptoms and history directly, then writes a
                structured summary for the doctor. You only need what you can measure.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <SectionHeading title="Patient" icon={<UserRound className="h-4 w-4" />} />

            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Elena Torres"
                autoFocus
              />
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
                <Label>Sex</Label>
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
                <Label>Height</Label>
                <Input
                  value={form.height}
                  onChange={(e) => set('height', e.target.value)}
                  placeholder="e.g. 178 cm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Weight</Label>
                <Input
                  value={form.weight}
                  onChange={(e) => set('weight', e.target.value)}
                  placeholder="e.g. 82 kg"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t pt-6">
            <SectionHeading
              title="Vitals"
              subtitle="Optional — leave blank what you haven't taken."
              icon={<Activity className="h-4 w-4" />}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Blood pressure</Label>
                <Input
                  value={form.bloodPressure}
                  onChange={(e) => set('bloodPressure', e.target.value)}
                  placeholder="e.g. 128/82"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Heart rate (bpm)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.heartRate}
                  onChange={(e) => set('heartRate', e.target.value)}
                  placeholder="e.g. 88"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Temperature (°C)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.temperature}
                  onChange={(e) => set('temperature', e.target.value)}
                  placeholder="e.g. 37.2"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Oxygen saturation (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.oxygenSaturation}
                  onChange={(e) => set('oxygenSaturation', e.target.value)}
                  placeholder="e.g. 98"
                />
              </div>
            </div>
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          <Button onClick={submit} disabled={submitIntake.isPending || !isComplete} className="w-full">
            {submitIntake.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Start patient interview
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            The screen will lock. Use the staff exit password to unlock it afterwards.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
