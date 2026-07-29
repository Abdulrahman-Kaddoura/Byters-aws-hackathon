import { useState } from 'react';
import { useLocation } from 'wouter';
import { User, ClipboardList, Activity, Check, ArrowRight, ArrowLeft, X, Plus, Sparkles, Wand2, FileCheck2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSubmitIntake } from '@/hooks/useCases';
import { cn } from '@/lib/utils';

function ChipsInput({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  }
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <div className="flex flex-wrap gap-1.5 rounded-lg border bg-background p-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="flex flex-1 items-center gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder ?? 'Type and press Enter…'}
            className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          {draft && (
            <button type="button" onClick={add} className="text-primary" aria-label="Add">
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { key: 'demographics', label: 'Demographics', icon: User },
  { key: 'history', label: 'Medical History', icon: ClipboardList },
  { key: 'complaint', label: 'Current Complaint', icon: Activity },
  { key: 'review', label: 'Review', icon: FileCheck2 },
];

const SAMPLE = {
  name: 'Elena Torres',
  age: '52',
  gender: 'Female',
  weight: '68 kg',
  height: '164 cm',
  previousIllnesses: ['Hypertension', 'Hypothyroidism'],
  medications: ['Amlodipine 5 mg', 'Levothyroxine 75 mcg'],
  allergies: ['Sulfa drugs'],
  familyHistory: ['Mother — breast cancer'],
  lifestyle: 'Moderately active, office worker',
  smoking: 'Never',
  alcohol: 'Occasional',
  surgeries: ['Cholecystectomy (2015)'],
  symptoms: ['Palpitations', 'Intermittent chest flutter', 'Lightheadedness'],
  painScale: 3,
  duration: '2 weeks',
  timeline: 'Episodic, several times a day, lasting minutes',
  aggravating: 'Caffeine, stress',
  relieving: 'Rest',
};

export function NewCase() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const submitIntake = useSubmitIntake();

  const [form, setForm] = useState({
    name: '',
    age: '',
    gender: '',
    weight: '',
    height: '',
    previousIllnesses: [] as string[],
    medications: [] as string[],
    allergies: [] as string[],
    familyHistory: [] as string[],
    lifestyle: '',
    smoking: '',
    alcohol: '',
    surgeries: [] as string[],
    symptoms: [] as string[],
    painScale: 0,
    duration: '',
    timeline: '',
    aggravating: '',
    relieving: '',
  });

  function up<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function fillSample() {
    setForm({ ...form, ...SAMPLE });
  }

  async function submit() {
    setError(null);
    try {
      const created = await submitIntake.mutateAsync({
        patient: {
          name: form.name,
          age: Number(form.age) || 0,
          gender: form.gender || 'Other',
          weight: form.weight,
          height: form.height,
        },
        history: {
          previousIllnesses: form.previousIllnesses,
          medications: form.medications,
          allergies: form.allergies,
          familyHistory: form.familyHistory,
          surgeries: form.surgeries,
          lifestyle: form.lifestyle,
          smoking: form.smoking,
          alcohol: form.alcohol,
        },
        complaint: {
          symptoms: form.symptoms,
          painScale: form.painScale,
          duration: form.duration,
          timeline: form.timeline,
          aggravating: form.aggravating,
          relieving: form.relieving,
        },
        chiefComplaint: form.symptoms[0] ?? '',
      });
      navigate(`/cases/${created.id}/interview`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const Icon = STEPS[step].icon;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => (step > 0 ? setStep(step - 1) : navigate('/dashboard'))}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Patient Case</h1>
          <p className="mt-1 text-muted-foreground">
            Step {step + 1} of {STEPS.length}: {STEPS[step].label}
          </p>
        </div>
        <Button variant="outline" className="ml-auto" onClick={fillSample} type="button">
          <Wand2 className="h-4 w-4" /> Fill sample data
        </Button>
      </div>

      {/* Stepper */}
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const SIcon = s.icon;
          const state = i < step ? 'done' : i === step ? 'active' : 'pending';
          return (
            <div key={s.key} className="flex flex-1 items-center last:flex-none">
              <button onClick={() => i < step && setStep(i)} className="flex items-center gap-2.5" disabled={i > step}>
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                    state === 'done' && 'border-emerald-500 bg-emerald-500 text-white',
                    state === 'active' && 'border-primary bg-primary/10 text-primary',
                    state === 'pending' && 'border-border text-muted-foreground'
                  )}
                >
                  {state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : <SIcon className="h-[18px] w-[18px]" />}
                </span>
                <span className={cn('hidden text-sm font-medium sm:block', state === 'pending' && 'text-muted-foreground')}>{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <div className={cn('mx-3 h-px flex-1', i < step ? 'bg-emerald-400' : 'bg-border')} />}
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-2 border-b pb-4">
            <Icon className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{STEPS[step].label}</h2>
          </div>

          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Full name</Label>
                <Input value={form.name} onChange={(e) => up('name', e.target.value)} placeholder="e.g. Elena Torres" />
              </div>
              <div className="space-y-1.5">
                <Label>Age</Label>
                <Input value={form.age} onChange={(e) => up('age', e.target.value)} placeholder="Years" inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={form.gender} onValueChange={(v) => up('gender', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Weight</Label>
                  <Input value={form.weight} onChange={(e) => up('weight', e.target.value)} placeholder="e.g. 68 kg" />
                </div>
                <div className="space-y-1.5">
                  <Label>Height</Label>
                  <Input value={form.height} onChange={(e) => up('height', e.target.value)} placeholder="e.g. 164 cm" />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <ChipsInput label="Previous illnesses" values={form.previousIllnesses} onChange={(v) => up('previousIllnesses', v)} placeholder="e.g. Hypertension" />
                <ChipsInput label="Current medications" values={form.medications} onChange={(v) => up('medications', v)} placeholder="e.g. Amlodipine 5 mg" />
                <ChipsInput label="Allergies" values={form.allergies} onChange={(v) => up('allergies', v)} placeholder="e.g. Penicillin" />
                <ChipsInput label="Family history" values={form.familyHistory} onChange={(v) => up('familyHistory', v)} placeholder="e.g. Father — diabetes" />
                <ChipsInput label="Past surgeries" values={form.surgeries} onChange={(v) => up('surgeries', v)} placeholder="e.g. Appendectomy" />
                <div className="space-y-1.5">
                  <Label>Lifestyle</Label>
                  <Input value={form.lifestyle} onChange={(e) => up('lifestyle', e.target.value)} placeholder="Activity, diet, occupation…" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Smoking</Label>
                  <Select value={form.smoking} onValueChange={(v) => up('smoking', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Never">Never</SelectItem>
                      <SelectItem value="Ex-smoker">Ex-smoker</SelectItem>
                      <SelectItem value="Current smoker">Current smoker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Alcohol</Label>
                  <Select value={form.alcohol} onValueChange={(v) => up('alcohol', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Never">Never</SelectItem>
                      <SelectItem value="Occasional">Occasional</SelectItem>
                      <SelectItem value="Moderate">Moderate</SelectItem>
                      <SelectItem value="Heavy">Heavy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <ChipsInput label="Presenting symptoms" values={form.symptoms} onChange={(v) => up('symptoms', v)} placeholder="e.g. Chest pain" />
              <div>
                <Label>Pain scale — {form.painScale}/10</Label>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={form.painScale}
                  onChange={(e) => up('painScale', Number(e.target.value))}
                  className="mt-2 w-full accent-primary"
                />
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>No pain</span>
                  <span>Worst imaginable</span>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Duration</Label>
                  <Input value={form.duration} onChange={(e) => up('duration', e.target.value)} placeholder="e.g. 2 weeks" />
                </div>
                <div className="space-y-1.5">
                  <Label>Timeline / pattern</Label>
                  <Input value={form.timeline} onChange={(e) => up('timeline', e.target.value)} placeholder="e.g. Episodic, worse at night" />
                </div>
                <div className="space-y-1.5">
                  <Label>What makes it worse</Label>
                  <Input value={form.aggravating} onChange={(e) => up('aggravating', e.target.value)} placeholder="e.g. Exertion, caffeine" />
                </div>
                <div className="space-y-1.5">
                  <Label>What makes it better</Label>
                  <Input value={form.relieving} onChange={(e) => up('relieving', e.target.value)} placeholder="e.g. Rest" />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
                  <p className="text-[13px] text-muted-foreground">
                    Once you submit, Aura will conduct an adaptive interview with <span className="font-semibold text-foreground">{form.name || 'the patient'}</span>, ask
                    clarifying follow-up questions, and generate a structured clinical summary for the doctor.
                  </p>
                </div>
              </div>
              <ReviewGrid form={form} />
            </div>
          )}

          {error && <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

          <div className="mt-6 flex items-center justify-between border-t pt-4">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={submitIntake.isPending || !form.name}>
                {submitIntake.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Submit & start AI interview
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewGrid({ form }: { form: Record<string, any> }) {
  const rows: [string, string][] = [
    ['Name', form.name || '—'],
    ['Age / Gender', `${form.age || '—'} · ${form.gender || '—'}`],
    ['Weight / Height', `${form.weight || '—'} · ${form.height || '—'}`],
    ['Symptoms', form.symptoms.join(', ') || '—'],
    ['Pain scale', `${form.painScale}/10`],
    ['Duration', form.duration || '—'],
    ['Medications', form.medications.join(', ') || '—'],
    ['Allergies', form.allergies.join(', ') || '—'],
  ];
  return (
    <div className="grid gap-x-6 gap-y-0 rounded-lg border p-4 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b py-2.5 last:border-b-0">
          <span className="text-sm text-muted-foreground">{k}</span>
          <span className="text-right text-sm font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}
