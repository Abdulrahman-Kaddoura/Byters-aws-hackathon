import type { Diagnosis } from '../types';

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
