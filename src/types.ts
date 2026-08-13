// ---------------------------------------------------------------------------
// Domain types for the Aura clinical decision support prototype.
// Everything here is dummy data used to simulate the product experience.
// ---------------------------------------------------------------------------

export type Gender = 'Male' | 'Female' | 'Other';

export type CaseStatus =
  | 'New'
  | 'AI Interview'
  | 'Doctor Review'
  | 'Awaiting Examination'
  | 'Awaiting Tests'
  | 'Diagnosis in Progress'
  | 'Treatment'
  | 'Follow-up'
  | 'Completed'
  | 'Archived';

export type StageKey =
  | 'intake'
  | 'interview'
  | 'examination'
  | 'differential'
  | 'tests'
  | 'results'
  | 'diagnosis'
  | 'treatment'
  | 'followup'
  | 'completion';

export type Priority = 'High' | 'Medium' | 'Low';
export type Importance = 'Critical' | 'Important' | 'Routine';
export type Flag = 'normal' | 'abnormal' | 'critical';
export type Speaker = 'ai' | 'patient' | 'doctor' | 'system';

export interface ProgressStep {
  key: StageKey;
  label: string;
  status: 'done' | 'active' | 'pending';
}

export interface Patient {
  name: string;
  age: number;
  gender: Gender;
  weight: string; // e.g. "82 kg"
  height: string; // e.g. "178 cm"
  bmi?: string;
  bloodType?: string;
  occupation?: string;
  avatarHue?: number; // used to color the generated avatar
}

export interface MedicalHistory {
  previousIllnesses: string[];
  medications: string[];
  allergies: string[];
  familyHistory: string[];
  lifestyle: string;
  smoking: string;
  alcohol: string;
  surgeries: string[];
}

export interface Complaint {
  symptoms: string[];
  painScale: number; // 0-10
  duration: string;
  timeline: string;
  aggravating: string;
  relieving: string;
}

export interface ChatMessage {
  role: Speaker;
  text: string;
  time?: string;
}

export interface TimelineEntry {
  time: string;
  event: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface StructuredSummary {
  chiefComplaint: string;
  hpi: string; // history of present illness
  relevantHistory: string[];
  medications: string[];
  riskFactors: string[];
  redFlags: string[];
  timeline: TimelineEntry[];
  symptoms: string[];
  findings: string[];
}

export interface ExamRecommendation {
  id: string;
  name: string;
  reason: string;
  importance: Importance;
  confidence: number; // 0-100
  status: 'pending' | 'complete' | 'skipped';
  finding?: string;
  normalRange?: string;
  flag?: Flag;
  note?: string;
}

export type ReferenceType = 'guideline' | 'paper' | 'textbook' | 'case';

export interface Reference {
  type: ReferenceType;
  title: string;
  source: string;
  year?: number;
  snippet: string;
  strength?: 'Strong' | 'Moderate' | 'Supportive';
}

export interface SimilarCase {
  title: string;
  outcome: string;
  similarity: number; // 0-100
  detail: string;
}

export interface Diagnosis {
  id: string;
  name: string;
  confidence: number; // 0-100
  priority: Priority;
  category: string;
  tagline: string;
  reasoning: string;
  supporting: string[];
  contradicting: string[];
  missing: string[];
  recommendedTests: string[];
  confidenceExplanation: string;
  whyNot100: string;
  riskAssessment: string;
  nextAction: string;
  references: Reference[];
  similarCases: SimilarCase[];
  trend: { label: string; value: number }[];
  discussion: ChatMessage[];
}

export type TestStatus = 'recommended' | 'ordered' | 'pending' | 'completed';

export interface TestRecommendation {
  id: string;
  name: string;
  category: string;
  reason: string;
  expectedFinding: string;
  priority: Priority;
  cost: string;
  urgency: string;
  diagnosticValue: number; // 0-100
  status: TestStatus;
  result?: string;
  resultFlag?: Flag;
  resultDetail?: string;
}

export interface CaseTimelineEvent {
  time: string;
  date: string;
  title: string;
  description: string;
  actor: Speaker;
  stage: StageKey;
}

export interface FinalDiagnosis {
  name: string;
  confidence: number;
  reasoning: string;
  evidenceSummary: string[];
  ruledOut: { name: string; reason: string }[];
  treatment: string[];
  monitoring: string[];
  complications: string[];
  followUp: string[];
  status: 'proposed' | 'accepted';
}

export interface DoctorNote {
  time: string;
  author: string;
  text: string;
}

export type InsightKind = 'info' | 'warning' | 'success' | 'suggestion' | 'critical';

export interface AIInsight {
  kind: InsightKind;
  title: string;
  text: string;
}

export interface Vitals {
  bp?: string;
  hr?: string;
  rr?: string;
  spo2?: string;
  temp?: string;
}

export interface PatientCase {
  id: string;
  patient: Patient;
  history: MedicalHistory;
  complaint: Complaint;
  status: CaseStatus;
  stage: StageKey;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
  chiefComplaint: string;
  primaryImpression: string;
  interview: ChatMessage[];
  summary: StructuredSummary;
  vitals: Vitals;
  exams: ExamRecommendation[];
  diagnoses: Diagnosis[];
  tests: TestRecommendation[];
  timeline: CaseTimelineEvent[];
  finalDiagnosis?: FinalDiagnosis;
  notes: DoctorNote[];
  insights: AIInsight[];
  nextSteps: string[];
  recentUpdates: { time: string; text: string; actor: Speaker }[];
  assistantThread: ChatMessage[];
  conversations?: Conversation[];
  outcome?: string;
  lessonsLearned?: string[];
  associatedConditions?: string[];
  progress: ProgressStep[];
}

// ---------------------------------------------------------------------------
// Admin panel — hospital-provisioned accounts and custom permission groups.
// Cognito's 4 groups (below) stay the coarse identity/row-level-security
// role; PermissionGroup is a separate, admin-editable concept carrying
// fine-grained permissions (see docs/API.md and backend/sehati/permissions.py).
// ---------------------------------------------------------------------------
export type CognitoGroup = 'patient' | 'physician' | 'admin' | 'compliance';

export interface PermissionCatalogEntry {
  key: string;
  label: string;
}

export interface PermissionGroup {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppUser {
  sub: string;
  username: string;
  email: string;
  name: string;
  cognitoGroup: CognitoGroup;
  customGroups: string[];
  permissionOverrides: Record<string, boolean>;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
  /** The fixed super-admin account (see backend SUPER_ADMIN_USERNAME) — the
   * panel disables the controls that the server would reject anyway. */
  isSuperAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Shared reference-document library — clinical staff upload guideline/reference
// docs (e.g. "Type 2 Diabetes Guideline", tagged "diabetes"); the AI seam
// keyword-matches them in as grounding evidence for any case. See
// backend/sehati/db/resources_repo.py and docs/ARCHITECTURE.md §6.
// ---------------------------------------------------------------------------
export interface KnowledgeResource {
  id: string;
  title: string;
  tags: string[];
  s3Uri: string;
  fileExtension: string;
  uploadedBy: string;
  uploadedByUsername: string;
  createdAt: string;
  truncated: boolean;
}
