// Row shapes from Supabase (snake_case) and converters to the app types in lib/types.ts.
// Pair each `*_COLS` select string with its `to*` converter so every loader maps rows the
// same way. Schema: supabase/migrations/*_init_schema.sql.
import "server-only";
import type {
  Application,
  ApplicationEvent,
  ApplicantProfile,
  Company,
  Connection,
  FitEvaluation,
  FitRequirement,
  Job,
  LinkedInImportInfo,
  RecruiterMembership,
  RepoCategory,
  RepoEvaluation,
  ResumeInfo,
  TokenCost,
  WorkMode,
} from "@/lib/types";

const REPO_CATEGORIES: RepoCategory[] = ["dataArchitecture", "performance", "deployment", "codeQuality", "teamTopology"];

// ---------- companies ----------

export const COMPANY_COLS =
  "id, name, website, logo_url, description, verification_status, rejected_reason, created_at, company_domains(domain)";

export interface CompanyRow {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
  description: string | null;
  verification_status: Company["verificationStatus"];
  rejected_reason: string | null;
  created_at: string;
  company_domains?: Array<{ domain: string }> | null;
}

export function toCompany(r: CompanyRow): Company {
  return {
    id: r.id,
    name: r.name,
    website: r.website,
    logoUrl: r.logo_url,
    verificationStatus: r.verification_status,
    reviewReason: r.rejected_reason,
    domains: (r.company_domains ?? []).map((d) => d.domain),
    description: r.description,
    createdAt: r.created_at,
  };
}

// ---------- jobs ----------

export const JOB_COLS =
  "id, company_id, title, description, requirements, location, work_mode, token_cost, is_technical, status, published_at, created_at, updated_at";

export interface JobRow {
  id: string;
  company_id: string;
  title: string;
  description: string;
  requirements: string;
  location: string | null;
  work_mode: string | null;
  token_cost: number;
  is_technical: boolean;
  status: Job["status"];
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export function toJob(r: JobRow): Job {
  return {
    id: r.id,
    companyId: r.company_id,
    title: r.title,
    description: r.description,
    requirements: r.requirements,
    location: r.location,
    workMode: (r.work_mode as WorkMode | null) ?? null,
    tokenCost: r.token_cost as TokenCost,
    isTechnical: r.is_technical,
    status: r.status,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
}

/** App Job -> insert/update columns. Omits id and company_id. */
export function jobColumns(j: Partial<Job>) {
  const row: Record<string, unknown> = {};
  if (j.title !== undefined) row.title = j.title;
  if (j.description !== undefined) row.description = j.description;
  if (j.requirements !== undefined) row.requirements = j.requirements;
  if (j.location !== undefined) row.location = j.location;
  if (j.workMode !== undefined) row.work_mode = j.workMode;
  if (j.tokenCost !== undefined) row.token_cost = j.tokenCost;
  if (j.isTechnical !== undefined) row.is_technical = j.isTechnical;
  if (j.status !== undefined) row.status = j.status;
  if (j.publishedAt !== undefined) row.published_at = j.publishedAt;
  return row;
}

// ---------- fit evaluations ----------

export const FIT_COLS =
  "id, job_id, applicant_id, status, confidence_score, band, explanation, requirements, sub_scores, created_at";

export interface FitRow {
  id: string;
  job_id: string;
  applicant_id: string;
  status: FitEvaluation["status"];
  confidence_score: number | null;
  band: FitEvaluation["band"];
  explanation: string | null;
  requirements: Array<{ text: string; status: FitRequirement["met"]; evidence: string | null }> | null;
  sub_scores: FitEvaluation["sourceScores"] | null;
  created_at: string;
}

export function toFit(r: FitRow): FitEvaluation {
  return {
    id: r.id,
    jobId: r.job_id,
    applicantId: r.applicant_id,
    status: r.status,
    confidenceScore: r.confidence_score,
    band: r.band,
    explanation: r.explanation,
    requirements: (r.requirements ?? []).map((q) => ({ requirement: q.text, met: q.status, evidence: q.evidence ?? null })),
    sourceScores: r.sub_scores ?? undefined,
    createdAt: r.created_at,
  };
}

// ---------- repo evaluations (recruiter-only) ----------

export const REPO_COLS =
  "id, application_id, status, data_architecture_score, performance_score, deployment_score, code_quality_score, team_topology_score, overall_score, rationale, repo_url, repo_meta, commit_sha, flags, failure_code";

export interface RepoRow {
  id: string;
  application_id: string;
  status: RepoEvaluation["status"];
  data_architecture_score: number | null;
  performance_score: number | null;
  deployment_score: number | null;
  code_quality_score: number | null;
  team_topology_score: number | null;
  overall_score: number | string | null;
  rationale: Partial<Record<RepoCategory, { summary?: string }>> | null;
  repo_url: string;
  repo_meta: { full_name?: string } | null;
  commit_sha: string | null;
  flags: { likely_template_or_fork?: boolean } | null;
  failure_code: string | null;
}

export function toRepo(r: RepoRow): RepoEvaluation {
  const scored =
    r.data_architecture_score != null &&
    r.performance_score != null &&
    r.deployment_score != null &&
    r.code_quality_score != null &&
    r.team_topology_score != null;
  const rationale: RepoEvaluation["rationale"] = {};
  for (const c of REPO_CATEGORIES) {
    const summary = r.rationale?.[c]?.summary;
    if (summary) rationale[c] = summary;
  }
  return {
    id: r.id,
    applicationId: r.application_id,
    status: r.status,
    scores: scored
      ? {
          dataArchitecture: r.data_architecture_score!,
          performance: r.performance_score!,
          deployment: r.deployment_score!,
          codeQuality: r.code_quality_score!,
          teamTopology: r.team_topology_score!,
        }
      : null,
    overall: r.overall_score == null ? null : Number(r.overall_score),
    rationale,
    repoUrl: r.repo_url,
    repoFullName: r.repo_meta?.full_name ?? r.repo_url.replace("https://github.com/", ""),
    commitSha: r.commit_sha,
    flags: r.flags?.likely_template_or_fork ? ["fork"] : [],
    failureCode: r.failure_code,
  };
}

// ---------- applications ----------

export const APPLICATION_COLS =
  "id, job_id, applicant_id, status, token_cost, github_repo_url, submitted_at, updated_at, fit_evaluation_id, " +
  "application_events(from_status, to_status, created_at, actor_id, actor:profiles!application_events_actor_id_fkey(full_name))";

export interface ApplicationRow {
  id: string;
  job_id: string;
  applicant_id: string;
  status: Application["status"];
  token_cost: number;
  github_repo_url: string | null;
  submitted_at: string;
  updated_at: string | null;
  fit_evaluation_id: string | null;
  application_events?: Array<{
    from_status: ApplicationEvent["fromStatus"];
    to_status: ApplicationEvent["toStatus"];
    created_at: string;
    actor_id: string | null;
    actor: { full_name: string | null } | null;
  }> | null;
}

export function toApplication(r: ApplicationRow): Application {
  const events = [...(r.application_events ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map<ApplicationEvent>((e) => ({
      fromStatus: e.from_status,
      toStatus: e.to_status,
      at: e.created_at,
      // The applicant's own actions (submit, withdraw) carry no actor label.
      ...(e.actor_id && e.actor_id !== r.applicant_id && e.actor?.full_name ? { actorName: e.actor.full_name } : {}),
    }));
  return {
    id: r.id,
    jobId: r.job_id,
    applicantId: r.applicant_id,
    status: r.status,
    tokenCost: r.token_cost as TokenCost,
    githubRepoUrl: r.github_repo_url,
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at ?? r.submitted_at,
    fitEvaluationId: r.fit_evaluation_id,
    events,
  };
}

// ---------- applicant profiles (+ active resume, active LinkedIn import) ----------

export const APPLICANT_COLS =
  "profile_id, headline, target_seniority, location_pref, " +
  "profile:profiles!inner(id, email, full_name, avatar_url), " +
  "resume:resumes!applicant_profiles_active_resume_fk(id, original_filename, size_bytes, mime_type, parse_status, text_content), " +
  "linkedin:linkedin_imports!applicant_profiles_active_import_fk(id, status, files_present, counts)";

export interface ApplicantRow {
  profile_id: string;
  headline: string | null;
  target_seniority: string | null;
  location_pref: string | null;
  profile: { id: string; email: string; full_name: string | null; avatar_url: string | null };
  resume: {
    id: string;
    original_filename: string | null;
    size_bytes: number;
    mime_type: string;
    parse_status: ResumeInfo["parseStatus"];
    text_content: string | null;
  } | null;
  linkedin: {
    id: string;
    status: LinkedInImportInfo["status"];
    files_present: string[];
    counts: Partial<Record<keyof LinkedInImportInfo["counts"], { parsed?: number }>> | null;
  } | null;
}

export function toApplicant(r: ApplicantRow): ApplicantProfile {
  const counts = r.linkedin?.counts ?? {};
  const n = (k: keyof LinkedInImportInfo["counts"]) => counts[k]?.parsed ?? 0;
  return {
    id: r.profile_id,
    fullName: r.profile.full_name ?? r.profile.email,
    email: r.profile.email,
    avatarUrl: r.profile.avatar_url,
    headline: r.headline,
    targetSeniority: r.target_seniority,
    locationPref: (r.location_pref as WorkMode | null) ?? null,
    resume: r.resume
      ? {
          id: r.resume.id,
          fileName: r.resume.original_filename ?? "resume.pdf",
          sizeBytes: r.resume.size_bytes,
          mimeType: r.resume.mime_type,
          parseStatus: r.resume.parse_status,
          textContent: r.resume.text_content,
        }
      : null,
    linkedin: r.linkedin
      ? {
          id: r.linkedin.id,
          status: r.linkedin.status,
          filesPresent: r.linkedin.files_present.map((f) => f.replace(/\.csv$/, "")) as LinkedInImportInfo["filesPresent"],
          counts: { connections: n("connections"), companies: n("companies"), positions: n("positions"), skills: n("skills"), education: n("education") },
        }
      : null,
  };
}

/** LinkedIn file names as stored (`Profile` -> `Profile.csv`). */
export const toStoredLinkedInFiles = (files: string[]) => files.map((f) => (f.endsWith(".csv") ? f : `${f}.csv`));

/** LinkedIn counts as stored (`{connections: 10}` -> `{connections: {parsed: 10, skipped: 0}}`). */
export const toStoredLinkedInCounts = (counts: Partial<LinkedInImportInfo["counts"]>) =>
  Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, { parsed: v ?? 0, skipped: 0 }]));

// ---------- connections ----------

export const CONNECTION_COLS = "id, applicant_id, first_name, last_name, position, company_name";

export interface ConnectionRow {
  id: string;
  applicant_id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  company_name: string | null;
}

export function toConnection(r: ConnectionRow): Connection {
  return {
    id: r.id,
    ownerId: r.applicant_id,
    firstName: r.first_name,
    lastName: r.last_name,
    position: r.position,
    companyName: r.company_name ?? "",
  };
}

// ---------- recruiter memberships ----------

export const MEMBERSHIP_COLS = "id, company_id, profile_id, verification_status, work_email";

export interface MembershipRow {
  id: string;
  company_id: string;
  profile_id: string;
  verification_status: RecruiterMembership["verificationStatus"];
  work_email: string | null;
}

export function toMembership(r: MembershipRow): RecruiterMembership {
  return {
    recruiterId: r.profile_id,
    companyId: r.company_id,
    verificationStatus: r.verification_status,
    workEmail: r.work_email ?? "",
  };
}

// ---------- misc ----------

/** 'YYYY-MM' UTC credit period for a timestamp. */
export function tokenPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Throw on a Supabase error so loaders fail loudly instead of rendering empty pages. */
export function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}
