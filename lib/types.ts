// Shared domain types (camelCase, mirrors MASTER_PLAN §4/§7). The mock store and,
// later, the Supabase loaders both return these shapes.

export type Role = "applicant" | "recruiter" | "admin";
export type ApplicationStatus = "submitted" | "shortlisted" | "rejected" | "withdrawn";
export type JobStatus = "draft" | "open" | "closed" | "archived";
export type VerificationStatus = "pending" | "verified" | "rejected";
export type EvaluationStatus = "pending" | "running" | "succeeded" | "failed";
export type WorkMode = "remote" | "hybrid" | "onsite";
export type TokenCost = 1 | 2 | 3;
export type FitBand = "strong" | "good" | "moderate" | "limited";
export type RepoCategory = "security" | "organization" | "performance" | "testing";
export type ParseStatus = "pending" | "running" | "succeeded" | "failed";

export interface Company {
  id: string;
  name: string;
  website: string | null;
  logoUrl: string | null;
  verificationStatus: VerificationStatus;
  domains: string[];
  description: string | null;
}

export interface Job {
  id: string;
  companyId: string;
  title: string;
  description: string;
  requirements: string;
  location: string | null;
  workMode: WorkMode | null;
  tokenCost: TokenCost;
  isTechnical: boolean;
  status: JobStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Job joined with its company, as shown on cards. */
export interface JobWithCompany extends Job {
  company: Pick<Company, "id" | "name" | "logoUrl" | "verificationStatus">;
}

export interface FitRequirement {
  requirement: string;
  met: "yes" | "partial" | "no";
  evidence: string | null;
}

export interface FitEvaluation {
  id: string;
  jobId: string;
  applicantId: string;
  status: EvaluationStatus;
  confidenceScore: number | null;
  band: FitBand | null;
  explanation: string | null;
  requirements: FitRequirement[];
  createdAt: string;
}

/** Recruiter-only. Never import into applicant code. */
export interface RepoEvaluation {
  id: string;
  applicationId: string;
  status: EvaluationStatus;
  scores: Record<RepoCategory, number> | null;
  overall: number | null;
  rationale: Partial<Record<RepoCategory, string>>;
  repoUrl: string;
  repoFullName: string;
  commitSha: string | null;
  flags: string[];
  failureCode: string | null;
}

export interface ApplicationEvent {
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  at: string;
  actorName?: string;
}

export interface Application {
  id: string;
  jobId: string;
  applicantId: string;
  status: ApplicationStatus;
  tokenCost: TokenCost;
  githubRepoUrl: string | null;
  submittedAt: string;
  updatedAt: string;
  fitEvaluationId: string | null;
  events: ApplicationEvent[];
}

export interface ResumeInfo {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  parseStatus: ParseStatus;
  textContent: string | null;
}

export interface LinkedInImportInfo {
  id: string;
  status: ParseStatus;
  filesPresent: Array<"Profile" | "Positions" | "Skills" | "Education" | "Connections">;
  counts: { connections: number; companies: number; positions: number; skills: number; education: number };
}

export interface ApplicantProfile {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  headline: string | null;
  targetSeniority: string | null;
  locationPref: WorkMode | null;
  resume: ResumeInfo | null;
  linkedin: LinkedInImportInfo | null;
}

export interface Connection {
  id: string;
  ownerId: string;
  firstName: string;
  lastName: string;
  position: string | null;
  companyName: string;
}

export interface TokenBalance {
  period: string; // "2026-10"
  granted: number;
  spent: number;
  refunded: number;
  adjusted: number;
  total: number;
  balance: number;
  resetsAt: string; // ISO, first instant of next UTC month
}

export interface RecruiterMembership {
  recruiterId: string;
  companyId: string;
  verificationStatus: VerificationStatus;
  workEmail: string;
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fields?: Record<string, string> } };
