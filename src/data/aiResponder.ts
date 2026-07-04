import type { PatientCase, Diagnosis } from '../types';

// ---------------------------------------------------------------------------
// Simulated AI response engine. Purely rule/keyword based — no real model.
// Produces believable, reasoning-first answers grounded in the case data so
// the discussion and assistant panels feel interactive during a demo.
// ---------------------------------------------------------------------------

export interface SuggestedPrompt {
  label: string;
  question: string;
}

export const GLOBAL_PROMPTS: SuggestedPrompt[] = [
  { label: 'Summarize the case', question: 'Give me a concise summary of this case.' },
  { label: 'What is missing?', question: 'What information is still missing to reach a diagnosis?' },
  { label: 'What should I do next?', question: 'What should I do next?' },
  { label: 'Any red flags?', question: 'Are there any red flags I should be aware of?' },
];

export function diagnosisPrompts(dx: Diagnosis): SuggestedPrompt[] {
  return [
    { label: `Why ${dx.name}?`, question: `Why do you think this is ${dx.name}?` },
    { label: 'What evidence supports this?', question: 'What evidence supports this diagnosis?' },
    { label: 'What would increase confidence?', question: 'What would increase your confidence?' },
    { label: 'What test first?', question: 'What test should I order first?' },
    { label: 'Why not the alternatives?', question: 'Why not the other diagnoses on the differential?' },
  ];
}

function topDx(c: PatientCase): Diagnosis | undefined {
  return [...c.diagnoses].sort((a, b) => b.confidence - a.confidence)[0];
}

function list(items: string[], max = 4): string {
  const shown = items.slice(0, max);
  return shown.map((s) => `• ${s}`).join('\n');
}

// Returns a believable answer string. `dx` scopes the answer to one diagnosis
// (diagnosis discussion); when omitted the answer is case-level (assistant).
export function generateAIResponse(
  c: PatientCase,
  question: string,
  dx?: Diagnosis
): string {
  const q = question.toLowerCase();
  const focus = dx ?? topDx(c);

  const has = (...keys: string[]) => keys.some((k) => q.includes(k));

  // --- Why this diagnosis -------------------------------------------------
  if (has('why') && focus && (q.includes(focus.name.toLowerCase().split(' ')[0]) || has('this', 'diagnosis', 'think'))) {
    if (!has('not', "isn't", 'rule out', 'instead of')) {
      return `${focus.reasoning}\n\nThe features carrying the most weight are:\n${list(focus.supporting)}\n\nThat's why I currently place ${focus.name} at ${focus.confidence}% confidence.`;
    }
  }

  // --- Why NOT an alternative --------------------------------------------
  if (has('why not', 'rule out', 'instead', 'not pulmonary', 'not heart', 'alternativ', 'other diagnos')) {
    const others = c.diagnoses.filter((d) => d.id !== focus?.id);
    // try to find the specific alternative mentioned
    const mentioned = others.find((d) => q.includes(d.name.toLowerCase().split(' ')[0]));
    const target = mentioned ?? others[0];
    if (target) {
      return `I've weighed ${target.name} but kept it lower (${target.confidence}%). The features that argue against it here are:\n${list(target.contradicting)}\n\nIt stays on the differential rather than being dismissed — ${target.nextAction.charAt(0).toLowerCase() + target.nextAction.slice(1)}`;
    }
  }

  // --- Evidence -----------------------------------------------------------
  if (has('evidence', 'support', 'supporting', 'proof', 'basis')) {
    if (focus) {
      return `Here's the evidence I'm weighing for ${focus.name}:\n\nSupporting:\n${list(focus.supporting)}\n\nAgainst / not yet confirmed:\n${list(focus.contradicting.length ? focus.contradicting : ['No strong contradicting evidence at present'])}\n\n${focus.confidenceExplanation}`;
    }
  }

  // --- Confidence questions ----------------------------------------------
  if (has('increase confidence', 'raise confidence', 'more confident', 'higher confidence')) {
    if (focus) {
      return `To raise my confidence in ${focus.name}, the highest-value inputs would be:\n${list(focus.missing.length ? focus.missing : focus.recommendedTests)}\n\n${focus.whyNot100}`;
    }
  }
  if (has('why not 100', "isn't it 100", 'not certain', 'uncertain', 'why not certain')) {
    if (focus) return focus.whyNot100;
  }
  if (has('confidence', 'how sure', 'how confident', 'changed your confidence', 'change your confidence')) {
    if (focus) {
      const trend = focus.trend.map((t) => `${t.label}: ${t.value}%`).join(' → ');
      return `${focus.name} is at ${focus.confidence}% confidence.\n\n${focus.confidenceExplanation}\n\nHow it has evolved: ${trend}. Each new finding re-weights the estimate — for example, ${focus.whyNot100}`;
    }
  }

  // --- What test first ----------------------------------------------------
  if (has('test first', 'order first', 'which test', 'what test', 'investigation', 'work up', 'workup')) {
    const tests = focus?.recommendedTests ?? c.tests.map((t) => t.name);
    return `For ${focus?.name ?? 'this case'}, I'd prioritize:\n${list(tests)}\n\n${focus?.nextAction ?? c.nextSteps[0]}`;
  }

  // --- Missing info -------------------------------------------------------
  if (has('missing', "what don't we know", 'what do we not know', 'gaps', 'need to know')) {
    const missing = focus?.missing?.length ? focus.missing : c.summary.findings;
    return `The key gaps right now are:\n${list(missing)}\n\nClosing these would let me either confirm ${focus?.name ?? 'the leading diagnosis'} or meaningfully re-rank the differential.`;
  }

  // --- Next steps ---------------------------------------------------------
  if (has('next', 'what should i do', 'what now', 'plan', 'manage', 'recommend')) {
    return `Here's what I'd suggest next:\n${list(c.nextSteps)}\n\n${focus ? focus.nextAction : ''}`.trim();
  }

  // --- Red flags ----------------------------------------------------------
  if (has('red flag', 'danger', 'worried', 'concern', 'safety', 'serious', 'emergency')) {
    return `The safety considerations I'm tracking:\n${list(c.summary.redFlags)}\n\n${c.insights.find((i) => i.kind === 'critical')?.text ?? 'No immediately life-threatening features, but continue to monitor.'}`;
  }

  // --- Risk ---------------------------------------------------------------
  if (has('risk', 'severity', 'how bad', 'prognosis')) {
    if (focus) return focus.riskAssessment;
  }

  // --- Summary ------------------------------------------------------------
  if (has('summar', 'overview', 'tell me about', 'what is going on', "what's going on", 'recap')) {
    return `${c.summary.chiefComplaint}\n\nMy leading impression is ${focus?.name ?? c.primaryImpression} (${focus?.confidence ?? ''}%). ${focus?.tagline ?? ''}\n\nKey supporting features:\n${list(focus?.supporting ?? c.summary.symptoms)}`;
  }

  // --- References / literature -------------------------------------------
  if (has('literature', 'reference', 'guideline', 'paper', 'research', 'evidence base', 'study', 'studies', 'source')) {
    if (focus && focus.references.length) {
      const refs = focus.references
        .map((r) => `• ${r.title} — ${r.source}${r.year ? `, ${r.year}` : ''}: "${r.snippet}"`)
        .join('\n');
      return `Here are the references I'm drawing on for ${focus.name}:\n\n${refs}`;
    }
  }

  // --- Similar cases ------------------------------------------------------
  if (has('similar', 'previous case', 'seen before', 'historical', 'other patients')) {
    if (focus && focus.similarCases.length) {
      const sc = focus.similarCases
        .map((s) => `• ${s.title} — ${s.outcome} (${s.similarity}% similar): ${s.detail}`)
        .join('\n');
      return `Comparable cases from the archive:\n\n${sc}`;
    }
    return `I don't have a close historical match on file for this specific presentation, but the leading diagnosis follows a well-characterized pattern.`;
  }

  // --- Treatment ----------------------------------------------------------
  if (has('treat', 'medication', 'drug', 'antibiotic', 'therapy', 'prescribe')) {
    if (c.finalDiagnosis) {
      return `Suggested management for ${c.finalDiagnosis.name}:\n${list(c.finalDiagnosis.treatment)}\n\nI'd also monitor:\n${list(c.finalDiagnosis.monitoring, 3)}`;
    }
    return `A treatment plan is best finalized once the diagnosis is confirmed. Based on the leading impression (${focus?.name}), the immediate action is: ${focus?.nextAction}`;
  }

  // --- Fallback: reasoning-first ------------------------------------------
  if (focus) {
    return `Good question. Let me reason through it rather than just give a verdict.\n\nFor ${focus.name}, the picture rests on: ${focus.supporting.slice(0, 3).join(', ')}. ${focus.confidenceExplanation}\n\nIf you can tell me more specifically what you'd like to explore — the evidence, the alternatives, what's missing, or what to order next — I can go deeper.`;
  }
  return `I want to make sure I answer usefully. I can walk through the differential, explain my reasoning and confidence, tell you what's missing, or suggest the next test or treatment. Which would help most?`;
}
