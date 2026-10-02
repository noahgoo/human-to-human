import "server-only";
import { createHash } from "node:crypto";
import { admin } from "@/lib/supabase/admin";
import {
  APPLICATION_COLS,
  COMPANY_COLS,
  FIT_COLS,
  JOB_COLS,
  REPO_COLS,
  must,
  toApplication,
  toCompany,
  toFit,
  toJob,
  toRepo,
  tokenPeriod,
  type ApplicationRow,
  type CompanyRow,
  type FitRow,
  type JobRow,
  type RepoRow,
} from "@/lib/db/rows";
import type {
  ApplicantProfile,
  Application,
  FitEvaluation,
  Job,
  JobWithCompany,
  RepoEvaluation,
} from "@/lib/types";
import type { JobListFilters } from "@/lib/data/jobs";
import type { ApplicantApplicationCard } from "@/lib/data/jobs";
import type { MyApplicationDetail, MyApplicationListItem, StoredRepoScore } from "@/lib/data/applications";
import type { RecruiterJobListItem, RecruiterJobMetrics } from "@/lib/data/recruiter-jobs";
import type { CompanyJobOption } from "@/lib/data/pipeline";
import { jevScoresFromFit } from "@/lib/data/scoring";
import type { LoadedRepo } from "@/lib/github/public-projects";
import type { GithubReviewOutcome } from "@/lib/ai/jev/evaluate";
import { recruiterRepoFromReview } from "@/lib/ai/repo/recruiter-scores";

const JOB_WITH_COMPANY =
  `${JOB_COLS}, companies!inner(id, name, logo_url, verification_status)`;

type CompanyEmbed = {
  id: string;
  name: string;
  logo_url: string | null;
  verification_status: CompanyRow["verification_status"];
};

type JobWithCompanyRow = JobRow & {
  companies: CompanyEmbed | CompanyEmbed[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toJobWithCompany(row: JobWithCompanyRow): JobWithCompany | null {
  const company = one(row.companies);
  if (!company) return null;
  return {
    ...toJob(row),
    company: {
      id: company.id,
      name: company.name,
      logoUrl: company.logo_url,
      verificationStatus: company.verification_status,
    },
  };
}

export async function getLiveCompany(companyId: string) {
  const row = must(
    await admin().from("companies").select(COMPANY_COLS).eq("id", companyId).maybeSingle(),
    "companies",
  ) as CompanyRow | null;
  return row ? toCompany(row) : null;
}

export async function getLiveJob(jobId: string): Promise<(JobWithCompany & { companyVerified: boolean }) | null> {
  const row = must(
    await admin().from("jobs").select(JOB_WITH_COMPANY).eq("id", jobId).maybeSingle(),
    "jobs",
  ) as unknown as JobWithCompanyRow | null;
  const job = row ? toJobWithCompany(row) : null;
  if (!job) return null;
  return { ...job, companyVerified: job.company.verificationStatus === "verified" };
}

export async function listLiveOpenJobs(filters: JobListFilters = {}): Promise<JobWithCompany[]> {
  const rows = must(
    await admin()
      .from("jobs")
      .select(JOB_WITH_COMPANY)
      .eq("status", "open")
      .eq("companies.verification_status", "verified"),
    "jobs",
  ) as unknown as JobWithCompanyRow[];
  const q = filters.q?.trim().toLowerCase();
  return rows
    .map(toJobWithCompany)
    .filter((job): job is JobWithCompany => job != null)
    .filter((job) => {
      if (filters.technical && !job.isTechnical) return false;
      if (filters.maxCost != null && job.tokenCost > filters.maxCost) return false;
      if (q && !`${job.title} ${job.company.name}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.publishedAt ?? b.createdAt) - Date.parse(a.publishedAt ?? a.createdAt));
}

async function appliedIds(applicantId: string, jobId: string): Promise<boolean> {
  const row = must(
    await admin()
      .from("applications")
      .select("id")
      .eq("applicant_id", applicantId)
      .eq("job_id", jobId)
      .maybeSingle(),
    "applications",
  ) as { id: string } | null;
  return Boolean(row);
}

export async function getLiveJobForApplicant(jobId: string, applicantId: string): Promise<JobWithCompany | null> {
  const job = await getLiveJob(jobId);
  if (!job || !job.companyVerified) return null;
  const applied = await appliedIds(applicantId, jobId);
  if (job.status !== "open" && !(job.status === "closed" && applied)) return null;
  return job;
}

type AppCardRow = {
  id: string;
  job_id: string;
  status: ApplicantApplicationCard["status"];
  submitted_at: string;
  token_cost: number;
  jobs:
    | { title: string; companies: { name: string } | { name: string }[] | null }
    | Array<{ title: string; companies: { name: string } | { name: string }[] | null }>
    | null;
};

export async function listLiveApplicantApplications(applicantId: string): Promise<ApplicantApplicationCard[]> {
  const rows = must(
    await admin()
      .from("applications")
      .select("id, job_id, status, submitted_at, token_cost, jobs(title, companies(name))")
      .eq("applicant_id", applicantId)
      .order("submitted_at", { ascending: false }),
    "applications",
  ) as unknown as AppCardRow[];
  return rows.map((row) => {
    const job = one(row.jobs);
    const company = one(job?.companies);
    return {
      id: row.id,
      jobId: row.job_id,
      jobTitle: job?.title ?? "Role",
      companyName: company?.name ?? "Company",
      status: row.status,
      submittedAt: row.submitted_at,
      tokenCost: row.token_cost as ApplicantApplicationCard["tokenCost"],
    };
  });
}

export async function getLiveApplicationForJob(applicantId: string, jobId: string): Promise<Application | undefined> {
  const row = must(
    await admin()
      .from("applications")
      .select(APPLICATION_COLS)
      .eq("applicant_id", applicantId)
      .eq("job_id", jobId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "applications",
  ) as ApplicationRow | null;
  return row ? toApplication(row) : undefined;
}

export async function listLiveSucceededFits(applicantId: string): Promise<Map<string, FitEvaluation>> {
  const rows = must(
    await admin()
      .from("fit_evaluations")
      .select(FIT_COLS)
      .eq("applicant_id", applicantId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false }),
    "fit_evaluations",
  ) as FitRow[];
  const map = new Map<string, FitEvaluation>();
  for (const row of rows) {
    const fit = toFit(row);
    if (!map.has(fit.jobId)) map.set(fit.jobId, fit);
  }
  return map;
}

function countsFor(jobId: string, apps: Array<{ job_id: string; status: string }>) {
  const mine = apps.filter((app) => app.job_id === jobId);
  return {
    applicationCount: mine.length,
    activeCount: mine.filter((app) => app.status === "submitted" || app.status === "shortlisted").length,
    newCount: mine.filter((app) => app.status === "submitted").length,
    shortlistedCount: mine.filter((app) => app.status === "shortlisted").length,
    unactedCount: mine.filter((app) => app.status === "submitted").length,
  };
}

export async function listLiveRecruiterJobs(companyId: string): Promise<{
  jobs: RecruiterJobListItem[];
  metrics: RecruiterJobMetrics;
}> {
  const rows = must(
    await admin().from("jobs").select(JOB_COLS).eq("company_id", companyId),
    "jobs",
  ) as JobRow[];
  const jobs = rows.map(toJob);
  const ids = jobs.map((job) => job.id);
  const apps =
    ids.length === 0
      ? []
      : (must(
          await admin().from("applications").select("job_id, status").in("job_id", ids),
          "applications",
        ) as Array<{ job_id: string; status: string }>);
  const statusOrder = { open: 0, draft: 1, closed: 2, archived: 3 } as const;
  const listed = jobs
    .map((job) => ({ ...job, ...countsFor(job.id, apps) }))
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.updatedAt.localeCompare(a.updatedAt));
  return {
    jobs: listed,
    metrics: {
      openJobs: listed.filter((job) => job.status === "open").length,
      totalApplicants: apps.length,
      newApplicants: apps.filter((app) => app.status === "submitted").length,
      shortlisted: apps.filter((app) => app.status === "shortlisted").length,
    },
  };
}

export async function getLiveRecruiterJob(companyId: string, jobId: string): Promise<RecruiterJobListItem | null> {
  const dashboard = await listLiveRecruiterJobs(companyId);
  return dashboard.jobs.find((job) => job.id === jobId) ?? null;
}

export interface LivePipeline {
  job: Job;
  companyJobs: CompanyJobOption[];
  applications: Application[];
  applicants: ApplicantProfile[];
  fitEvaluations: FitEvaluation[];
  repoEvaluations: RepoEvaluation[];
}

export async function loadLivePipeline(jobId: string, companyId: string): Promise<LivePipeline | null> {
  const jobRow = must(
    await admin().from("jobs").select(JOB_COLS).eq("id", jobId).eq("company_id", companyId).maybeSingle(),
    "jobs",
  ) as JobRow | null;
  if (!jobRow) return null;

  const dashboard = await listLiveRecruiterJobs(companyId);
  const appRows = must(
    await admin().from("applications").select(APPLICATION_COLS).eq("job_id", jobId),
    "applications",
  ) as unknown as ApplicationRow[];
  const applications = appRows.map(toApplication);
  const fitIds = applications.map((app) => app.fitEvaluationId).filter((id): id is string => Boolean(id));
  const appIds = applications.map((app) => app.id);
  const applicantIds = [...new Set(applications.map((app) => app.applicantId))];

  const [fitRows, repoRows, people] = await Promise.all([
    fitIds.length
      ? admin().from("fit_evaluations").select(FIT_COLS).in("id", fitIds)
      : Promise.resolve({ data: [] as FitRow[], error: null }),
    appIds.length
      ? admin().from("repo_evaluations").select(REPO_COLS).in("application_id", appIds)
      : Promise.resolve({ data: [] as RepoRow[], error: null }),
    loadPeople(applicantIds),
  ]);
  const fits = must(fitRows, "fit_evaluations") as FitRow[];
  const repos = must(repoRows, "repo_evaluations") as RepoRow[];

  return {
    job: toJob(jobRow),
    companyJobs: dashboard.jobs.map((job) => ({
      id: job.id,
      title: job.title,
      applicantCount: job.applicationCount,
    })),
    applications,
    applicants: people,
    fitEvaluations: fits.map(toFit),
    repoEvaluations: repos.map(toRepo),
  };
}

async function loadPeople(applicantIds: string[]): Promise<ApplicantProfile[]> {
  if (applicantIds.length === 0) return [];
  const profiles = must(
    await admin().from("profiles").select("id, email, full_name, avatar_url").in("id", applicantIds),
    "profiles",
  ) as Array<{ id: string; email: string; full_name: string | null; avatar_url: string | null }>;
  const extras = must(
    await admin()
      .from("applicant_profiles")
      .select(
        "profile_id, headline, resume:resumes!applicant_profiles_active_resume_fk(original_filename, text_content)",
      )
      .in("profile_id", applicantIds),
    "applicant_profiles",
  ) as Array<{
    profile_id: string;
    headline: string | null;
    resume: { original_filename: string | null; text_content: string | null } | { original_filename: string | null; text_content: string | null }[] | null;
  }>;
  const extraById = new Map(extras.map((row) => [row.profile_id, row]));
  return profiles.map((profile) => {
    const extra = extraById.get(profile.id);
    const resume = Array.isArray(extra?.resume) ? extra?.resume[0] : extra?.resume;
    return {
      id: profile.id,
      fullName: profile.full_name ?? profile.email,
      email: profile.email,
      avatarUrl: profile.avatar_url,
      headline: extra?.headline ?? null,
      targetSeniority: null,
      locationPref: null,
      resume: resume?.text_content
        ? {
            id: `${profile.id}-resume`,
            fileName: resume.original_filename ?? "resume.pdf",
            sizeBytes: resume.text_content.length,
            mimeType: "text/plain",
            parseStatus: "succeeded",
            textContent: resume.text_content,
          }
        : null,
      linkedin: null,
    };
  });
}

type ListRow = {
  id: string;
  status: MyApplicationListItem["status"];
  submitted_at: string;
  token_cost: number;
  jobs:
    | {
        title: string;
        is_technical: boolean;
        companies: { name: string; logo_url: string | null } | { name: string; logo_url: string | null }[] | null;
      }
    | Array<{
        title: string;
        is_technical: boolean;
        companies: { name: string; logo_url: string | null } | { name: string; logo_url: string | null }[] | null;
      }>
    | null;
};

export async function listLiveMyApplications(applicantId: string): Promise<MyApplicationListItem[]> {
  const rows = must(
    await admin()
      .from("applications")
      .select("id, status, submitted_at, token_cost, jobs(title, is_technical, companies(name, logo_url))")
      .eq("applicant_id", applicantId)
      .order("submitted_at", { ascending: false }),
    "applications",
  ) as unknown as ListRow[];
  return rows.map((row) => {
    const job = one(row.jobs);
    const company = one(job?.companies);
    return {
      id: row.id,
      jobTitle: job?.title ?? "Untitled role",
      companyName: company?.name ?? "Company",
      companyLogoUrl: company?.logo_url ?? null,
      status: row.status,
      submittedAt: row.submitted_at,
      tokenCost: row.token_cost as MyApplicationListItem["tokenCost"],
      isTechnical: Boolean(job?.is_technical),
    };
  });
}

export async function getLiveMyApplication(applicantId: string, applicationId: string): Promise<MyApplicationDetail | null> {
  const row = must(
    await admin().from("applications").select(APPLICATION_COLS).eq("id", applicationId).maybeSingle(),
    "applications",
  ) as ApplicationRow | null;
  if (!row || row.applicant_id !== applicantId) return null;
  const application = toApplication(row);
  const job = await getLiveJob(application.jobId);
  const fitRow = application.fitEvaluationId
    ? (must(
        await admin().from("fit_evaluations").select(FIT_COLS).eq("id", application.fitEvaluationId).maybeSingle(),
        "fit_evaluations",
      ) as FitRow | null)
    : null;
  const fit = fitRow ? toFit(fitRow) : undefined;
  const repoRow = job?.isTechnical
    ? (must(
        await admin().from("repo_evaluations").select(REPO_COLS).eq("application_id", application.id).maybeSingle(),
        "repo_evaluations",
      ) as RepoRow | null)
    : null;
  const repo = repoRow ? toStoredRepo(toRepo(repoRow)) : null;
  return {
    id: application.id,
    jobTitle: job?.title ?? "Untitled role",
    companyName: job?.company.name ?? "Company",
    companyLogoUrl: job?.company.logoUrl ?? null,
    location: job?.location ?? null,
    workMode: job?.workMode ?? null,
    status: application.status,
    submittedAt: application.submittedAt,
    tokenCost: application.tokenCost,
    isTechnical: Boolean(job?.isTechnical),
    githubRepoUrl: application.githubRepoUrl,
    jev: jevScoresFromFit(fit),
    repo,
    events: application.events.map((event) => ({ toStatus: event.toStatus, at: event.at })),
  };
}

function toStoredRepo(raw: RepoEvaluation): StoredRepoScore {
  return {
    status: raw.status,
    scores: raw.scores,
    overall: raw.overall,
    rationale: raw.rationale,
    repoFullName: raw.repoFullName,
    repoUrl: raw.repoUrl,
    commitSha: raw.commitSha,
    flags: raw.flags,
    failureCode: raw.failureCode,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function findLiveIdempotentApply(
  applicantId: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<{ applicationId: string } | "mismatch" | null> {
  if (!UUID.test(idempotencyKey)) return null;
  const row = must(
    await admin()
      .from("applications")
      .select("id, request_hash")
      .eq("applicant_id", applicantId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle(),
    "applications",
  ) as { id: string; request_hash: string } | null;
  if (!row) return null;
  if (row.request_hash !== requestHash) return "mismatch";
  return { applicationId: row.id };
}

export async function persistLiveApplication(input: {
  applicantId: string;
  job: Job;
  tokenCost: number;
  githubRepoUrl: string | null;
  idempotencyKey: string;
  requestHash: string;
  fit: FitEvaluation;
  repo: { loaded: LoadedRepo; review: GithubReviewOutcome } | null;
}): Promise<{ applicationId: string }> {
  const now = new Date().toISOString();
  const fitId = crypto.randomUUID();
  const applicationId = crypto.randomUUID();
  const db = admin();

  const { error: fitError } = await db.from("fit_evaluations").insert({
    id: fitId,
    applicant_id: input.applicantId,
    job_id: input.job.id,
    input_hash: sha256(`${input.applicantId}:${input.job.id}:${input.requestHash}`),
    status: "succeeded",
    confidence_score: Math.min(100, Math.max(0, Math.round(input.fit.confidenceScore ?? 0))),
    explanation: (input.fit.explanation || "Fit evaluation completed.").slice(0, 4000),
    prompt_version: "apply-v1",
    band: input.fit.band,
    requirements: input.fit.requirements.map((item) => ({
      text: item.requirement,
      status: item.met,
      evidence: item.evidence,
    })),
    sub_scores: input.fit.sourceScores ?? {},
    job_updated_at: input.job.updatedAt,
    completed_at: now,
  });
  if (fitError) throw new Error(`fit_evaluations: ${fitError.message}`);

  const { error: appError } = await db.from("applications").insert({
    id: applicationId,
    job_id: input.job.id,
    applicant_id: input.applicantId,
    status: "submitted",
    token_cost: input.tokenCost,
    github_repo_url: input.githubRepoUrl,
    fit_evaluation_id: fitId,
    idempotency_key: input.idempotencyKey,
    request_hash: input.requestHash,
    submitted_at: now,
    status_changed_at: now,
  });
  if (appError) throw new Error(`applications: ${appError.message}`);

  const { error: eventError } = await db.from("application_events").insert({
    application_id: applicationId,
    actor_id: input.applicantId,
    from_status: null,
    to_status: "submitted",
    created_at: now,
  });
  if (eventError) throw new Error(`application_events: ${eventError.message}`);

  if (input.repo) {
    const row = repoRow(applicationId, input.repo.loaded, input.repo.review, now);
    const { error: repoError } = await db.from("repo_evaluations").insert(row as never);
    if (repoError) throw new Error(`repo_evaluations: ${repoError.message}`);
  }

  const { error: spendError } = await db.from("token_ledger").insert({
    applicant_id: input.applicantId,
    period: tokenPeriod(),
    kind: "application_spend",
    amount: -input.tokenCost,
    application_id: applicationId,
  });
  if (spendError) throw new Error(`token_ledger: ${spendError.message}`);

  return { applicationId };
}

function repoRow(applicationId: string, repo: LoadedRepo, review: GithubReviewOutcome, now: string) {
  const commitSha = repo.commitSha && /^[0-9a-f]{40}$/.test(repo.commitSha) ? repo.commitSha : null;
  const base = {
    application_id: applicationId,
    repo_url: `https://github.com/${repo.fullName}`,
    commit_sha: commitSha,
    repo_meta: { full_name: repo.fullName },
    flags: repo.isFork ? { likely_template_or_fork: true } : {},
    started_at: now,
    completed_at: now,
  };
  if (review && review.status === "succeeded") {
    const mapped = recruiterRepoFromReview(review);
    const rationale: Record<string, { summary: string }> = {};
    for (const [key, summary] of Object.entries(mapped.rationale)) {
      if (summary) rationale[key] = { summary };
    }
    return {
      ...base,
      status: "succeeded",
      data_architecture_score: mapped.scores.dataArchitecture,
      performance_score: mapped.scores.performance,
      deployment_score: mapped.scores.deployment,
      code_quality_score: mapped.scores.codeQuality,
      team_topology_score: mapped.scores.teamTopology,
      rationale,
      failure_code: null,
    };
  }
  return {
    ...base,
    status: "failed",
    data_architecture_score: null,
    performance_score: null,
    deployment_score: null,
    code_quality_score: null,
    team_topology_score: null,
    rationale: null,
    failure_code: "llm_failed",
  };
}
