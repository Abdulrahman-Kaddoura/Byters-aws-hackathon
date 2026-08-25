// ---------------------------------------------------------------------------
// Domain types for the Aura clinical decision support prototype.
// The live API contract shared by the client and backend/sehati/models.py.
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
  /** Performed by the doctor rather than recommended by Aura. */
  custom?: boolean;
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

/** `ordered` is "running, waiting on the result"; `declined` is "I chose not
 * to run this". Both keep a decision on the record rather than leaving a
 * recommendation dangling. */
export type TestStatus = 'recommended' | 'ordered' | 'pending' | 'declined' | 'completed';

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
  note?: string;
  /** Added by the doctor rather than recommended by Aura. */
  custom?: boolean;
  /** Which round of investigations this belongs to. The results analysis opens
   * a new round when what's in hand doesn't settle the question. */
  round?: number;
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

/** The doctor's own consultation with the patient, transcribed by
 * HealthScribe — a second source of history alongside the AI interview, fed to
 * every downstream AI step. Asked for once, when the doctor first opens the
 * case; `prompted` records that the question has been put, whichever way it
 * was answered. */
export interface Consultation {
  prompted: boolean;
  hasRecording?: boolean;
  answeredAt?: string;
  answeredBy?: string;
  jobName?: string;
  summary?: ConsultationSummary;
}

/** HealthScribe's sectioned summary. The four below are always present; the
 * service emits further sections (assessment, plan, …) depending on the
 * encounter, and those are passed through untouched. */
export interface ConsultationSummary {
  chief_complaint?: string | null;
  history_of_present_illness?: string | null;
  review_of_systems?: string | null;
  past_medical_history?: string | null;
  [section: string]: string | null | undefined;
}

/** The verdict from the last results analysis. `no_results` is the honest
 * answer when nothing has been resulted yet. */
export interface CaseAnalysis {
  verdict: 'no_results' | 'confident' | 'needs_more_tests';
  message: string;
  at?: string;
  newTestCount?: number;
  round?: number;
  resultsConsidered?: { name: string; result: string; flag?: Flag }[];
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
  documents?: CaseDocument[];
  consultation?: Consultation;
  /** Which round of investigations the workup is on. */
  testRound?: number;
  analysis?: CaseAnalysis;
  /** Why the doctor reopened a case that was on treatment. */
  reopenReason?: string;
  /** The nurse who admitted this patient. */
  createdByNurseId?: string;
  /** The doctor this case is routed to. Assignment is the access boundary:
   * the API only returns a case to the doctor it names (or to an admin). */
  assignedPhysicianId?: string;
  assignedAt?: string;
  assignedBy?: string;
}

/** A file attached to a case. The extracted text and the S3 key stay
 * server-side; downloads go through a short-lived presigned URL.
 *
 * A consultation recording is one of these too: `kind: 'audio'`, with its
 * HealthScribe transcript filling the same server-side text every other
 * document carries, so the AI grounds on it the same way. `status` tracks it
 * from upload through transcription — until it reads `transcribed`, the
 * recording is on the case but not yet context. */
export interface CaseDocument {
  id: string;
  name: string;
  contentType: string;
  extension: string;
  size: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  kind?: 'audio';
  status?: AudioStatus;
  jobName?: string;
  summary?: ConsultationSummary;
  transcribedAt?: string;
  failureReason?: string;
}

export type AudioStatus =
  | 'pending'
  | 'uploaded'
  | 'transcribing'
  | 'transcribed'
  | 'failed';

// ---------------------------------------------------------------------------
// Admin panel — hospital-provisioned accounts and custom permission groups.
// Cognito's 3 role groups (below) stay the coarse identity that drives
// row-level security; PermissionGroup is a separate, admin-editable concept
// carrying fine-grained permissions (see docs/API.md and
// backend/sehati/permissions.py). Patients never sign in, so there is no
// patient role: a nurse admits them and hands over her own device.
// ---------------------------------------------------------------------------
export type CognitoGroup = 'doctor' | 'nurse' | 'admin';

/** The answer from GET /me: who the caller is and what the *server* will let
 * them do. Every screen gates on this rather than on the JWT's group claim,
 * so the client can no longer disagree with the backend about access. */
export interface Me {
  sub: string;
  username: string;
  name: string;
  email: string;
  role: CognitoGroup | null;
  permissions: string[];
  /** This user's private labels, keyed by case id. Nobody else sees them. */
  caseTags: Record<string, string[]>;
}

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
