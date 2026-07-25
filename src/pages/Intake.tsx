import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  ClipboardList,
  Activity,
  Check,
  ArrowRight,
  ArrowLeft,
  X,
  Plus,
  Sparkles,
  Wand2,
  FileCheck2,
  MessagesSquare,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { isLive } from '../lib/config';
import * as api from '../lib/api';
import { cn } from '../lib/ui';

// ---- Chips input ----------------------------------------------------------
function ChipsInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  }
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-2 focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-500/18">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
          >
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
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
            className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          {draft && (
            <button onClick={add} className="text-brand-500" aria-label="Add">
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
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

export function Intake() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState(0);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const PHASES = [
    { icon: FileCheck2, text: 'Creating case record…' },
    { icon: MessagesSquare, text: 'Aura is interviewing the patient…' },
    { icon: Sparkles, text: 'Generating structured clinical summary…' },
  ];

  async function submit() {
    setSubmitting(true);
    setPhase(0);

    if (!isLive) {
      const t1 = setTimeout(() => setPhase(1), 1100);
      const t2 = setTimeout(() => setPhase(2), 2500);
      const t3 = setTimeout(() => {
        setSubmitting(false);
        setDone(true);
      }, 3900);
      return () => [t1, t2, t3].forEach(clearTimeout);
    }

    try {
      const created = await api.submitIntake({
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
      setPhase(2);
      setCreatedId(created.id);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Success state ------------------------------------------------------
  if (done) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <div className="card animate-fade-in p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <Check className="h-7 w-7" strokeWidth={2.5} />
          </span>
          <h2 className="mt-4 text-xl font-bold">Case created</h2>
          <p className="mt-1.5 text-sm text-secondary">
            {form.name || 'The patient'} has completed the AI interview. Aura has generated a structured clinical
            summary and is ready for your review.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              onClick={() => navigate(`/cases/${createdId ?? 'AUR-1046'}`)}
              className="btn btn-primary"
            >
              <Sparkles className="h-4 w-4" /> Open case & review summary
            </button>
            <button onClick={() => navigate('/cases')} className="btn btn-outline">
              Go to active cases
            </button>
          </div>
          {!isLive && (
            <p className="mt-5 rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted">
              Prototype note: submitted data isn't stored. This opens a representative sample case to demonstrate the
              downstream workflow.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---- Submitting overlay -------------------------------------------------
  if (submitting) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <div className="card p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-teal-500 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold">Aura is processing the intake</p>
              <p className="text-xs text-muted">This usually takes a few moments</p>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {PHASES.map((p, i) => {
              const Icon = p.icon;
              const state = i < phase ? 'done' : i === phase ? 'active' : 'pending';
              return (
                <div
                  key={i}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    state === 'active' && 'border-brand-300 bg-brand-50/60 dark:bg-brand-500/8',
                    state === 'pending' && 'opacity-50'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      state === 'done'
                        ? 'bg-emerald-500 text-white'
                        : state === 'active'
                          ? 'bg-brand-500 text-white'
                          : 'bg-[var(--bg-subtle)] text-muted'
                    )}
                  >
                    {state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="text-sm font-medium">{p.text}</span>
                  {state === 'active' && (
                    <span className="ml-auto flex items-center gap-1">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const Icon = STEPS[step].icon;

  return (
    <div>
      <PageHeader
        title="New Patient Intake"
        description="Capture the patient's details. Aura will then interview the patient and prepare a structured summary."
        actions={
          <button onClick={fillSample} className="btn btn-outline">
            <Wand2 className="h-4 w-4" /> Fill sample data
          </button>
        }
      />

      {/* Stepper */}
      <div className="mb-6 flex items-center">
        {STEPS.map((s, i) => {
          const SIcon = s.icon;
          const state = i < step ? 'done' : i === step ? 'active' : 'pending';
          return (
            <div key={s.key} className="flex flex-1 items-center last:flex-none">
              <button
                onClick={() => i < step && setStep(i)}
                className="flex items-center gap-2.5"
                disabled={i > step}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                    state === 'done' && 'border-emerald-500 bg-emerald-500 text-white',
                    state === 'active' && 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
                    state === 'pending' && 'border-[var(--border-strong)] text-muted'
                  )}
                >
                  {state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : <SIcon className="h-[18px] w-[18px]" />}
                </span>
                <span className={cn('hidden text-sm font-medium sm:block', state === 'pending' && 'text-muted')}>
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={cn('mx-3 h-px flex-1', i < step ? 'bg-emerald-400' : 'bg-[var(--border)]')} />
              )}
            </div>
          );
        })}
      </div>

      <div className="card p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2 border-b pb-4">
          <Icon className="h-5 w-5 text-brand-500" />
          <h2 className="text-lg font-semibold">{STEPS[step].label}</h2>
        </div>

        {/* Step 0 — Demographics */}
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input value={form.name} onChange={(e) => up('name', e.target.value)} className="input" placeholder="e.g. Elena Torres" />
            </Field>
            <Field label="Age">
              <input value={form.age} onChange={(e) => up('age', e.target.value)} className="input" placeholder="Years" inputMode="numeric" />
            </Field>
            <Field label="Gender">
              <select value={form.gender} onChange={(e) => up('gender', e.target.value)} className="input">
                <option value="">Select…</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Weight">
                <input value={form.weight} onChange={(e) => up('weight', e.target.value)} className="input" placeholder="e.g. 68 kg" />
              </Field>
              <Field label="Height">
                <input value={form.height} onChange={(e) => up('height', e.target.value)} className="input" placeholder="e.g. 164 cm" />
              </Field>
            </div>
          </div>
        )}

        {/* Step 1 — History */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <ChipsInput label="Previous illnesses" values={form.previousIllnesses} onChange={(v) => up('previousIllnesses', v)} placeholder="e.g. Hypertension" />
              <ChipsInput label="Current medications" values={form.medications} onChange={(v) => up('medications', v)} placeholder="e.g. Amlodipine 5 mg" />
              <ChipsInput label="Allergies" values={form.allergies} onChange={(v) => up('allergies', v)} placeholder="e.g. Penicillin" />
              <ChipsInput label="Family history" values={form.familyHistory} onChange={(v) => up('familyHistory', v)} placeholder="e.g. Father — diabetes" />
              <ChipsInput label="Past surgeries" values={form.surgeries} onChange={(v) => up('surgeries', v)} placeholder="e.g. Appendectomy" />
              <Field label="Lifestyle">
                <input value={form.lifestyle} onChange={(e) => up('lifestyle', e.target.value)} className="input" placeholder="Activity, diet, occupation…" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Smoking">
                <select value={form.smoking} onChange={(e) => up('smoking', e.target.value)} className="input">
                  <option value="">Select…</option>
                  <option>Never</option>
                  <option>Ex-smoker</option>
                  <option>Current smoker</option>
                </select>
              </Field>
              <Field label="Alcohol">
                <select value={form.alcohol} onChange={(e) => up('alcohol', e.target.value)} className="input">
                  <option value="">Select…</option>
                  <option>Never</option>
                  <option>Occasional</option>
                  <option>Moderate</option>
                  <option>Heavy</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {/* Step 2 — Complaint */}
        {step === 2 && (
          <div className="space-y-4">
            <ChipsInput label="Presenting symptoms" values={form.symptoms} onChange={(v) => up('symptoms', v)} placeholder="e.g. Chest pain" />
            <Field label={`Pain scale — ${form.painScale}/10`}>
              <input
                type="range"
                min={0}
                max={10}
                value={form.painScale}
                onChange={(e) => up('painScale', Number(e.target.value))}
                className="w-full accent-brand-500"
              />
              <div className="mt-1 flex justify-between text-[11px] text-muted">
                <span>No pain</span>
                <span>Worst imaginable</span>
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duration">
                <input value={form.duration} onChange={(e) => up('duration', e.target.value)} className="input" placeholder="e.g. 2 weeks" />
              </Field>
              <Field label="Timeline / pattern">
                <input value={form.timeline} onChange={(e) => up('timeline', e.target.value)} className="input" placeholder="e.g. Episodic, worse at night" />
              </Field>
              <Field label="What makes it worse">
                <input value={form.aggravating} onChange={(e) => up('aggravating', e.target.value)} className="input" placeholder="e.g. Exertion, caffeine" />
              </Field>
              <Field label="What makes it better">
                <input value={form.relieving} onChange={(e) => up('relieving', e.target.value)} className="input" placeholder="e.g. Rest" />
              </Field>
            </div>
          </div>
        )}

        {/* Step 3 — Review */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="rounded-lg border bg-brand-50/50 p-4 dark:bg-brand-500/8">
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 text-brand-600 dark:text-brand-300" />
                <p className="text-[13px] text-secondary">
                  Once you submit, Aura will conduct an adaptive interview with{' '}
                  <span className="font-semibold">{form.name || 'the patient'}</span>, ask clarifying follow-up
                  questions, and generate a structured clinical summary for you — you'll never need to read the raw
                  transcript.
                </p>
              </div>
            </div>
            <ReviewGrid form={form} />
          </div>
        )}

        {error && (
          <p className="mt-6 rounded-lg border border-rose-200/70 bg-rose-50/60 px-3 py-2 text-[13px] text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </p>
        )}

        {/* Nav */}
        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn btn-ghost disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep((s) => s + 1)} className="btn btn-primary">
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={submit} className="btn btn-primary">
              <Sparkles className="h-4 w-4" /> Submit & start AI interview
            </button>
          )}
        </div>
      </div>
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
          <span className="text-sm text-muted">{k}</span>
          <span className="text-right text-sm font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}
