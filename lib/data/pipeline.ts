import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/mock/db";
import { rankScore } from "@/lib/ranking/bands";
import type { ApplicationStatus, EvaluationStatus, FitRequirement, Job, RepoCategory } from "@/lib/types";
import type { Application } from "@/lib/types";

export type StatusFilter = "active" | "shortlisted" | "rejected" | "withdrawn";
export type SortKey = "rank" | "confidence" | "github" | "newest" | "oldest";
export type RankTier = 0 | 1 | 2;

/** Recruiter-only GitHub review. Null on non-technical jobs. */
export interface RecruiterRepo {
  status: EvaluationStatus;
  scores: Record<RepoCategory, number> | null;
  overall: number | null;
  rationale: Partial<Record<RepoCategory, string>>;
  repoFullName: string;
  repoUrl: string;
  commitSha: string | null;
  flags: string[];
  failureCode: string | null;
}

export interface RankedApplicant {
  application: Application;
  applicant: { id: string; name: string; headline: string | null; avatarUrl: string | null };
  fit: {
    score: number | null;
    status: EvaluationStatus | null;
    explanation: string | null;
    requirements: FitRequirement[];
  };
  repo: RecruiterRepo | null;
  rank: { tier: RankTier; score: number | null; position: number | null };
}

export interface PipelineCounts {
  active: number;
  /** Applications still in `submitted`. */
  new: number;
  shortlisted: number;
  rejected: number;
  withdrawn: number;
  incomplete: number;
  unscored: number;
}

export interface ApplicantsQuery {
  status: StatusFilter;
  sort: SortKey;
  minConfidence: 50 | 70 | 85 | null;
  includeIncomplete: boolean;
  cursor: string | null;
  limit: number;
}

export interface CompanyJobOption {
  id: string;
  title: string;
  applicantCount: number;
}

export interface ApplicantsPageData {
  job: Job;
  rows: RankedApplicant[];
  total: number;
  counts: PipelineCounts;
  /** Tier sizes of the filtered list, before the limit. */
  tierCounts: { complete: number; incomplete: number; unscored: number };
  companyJobs: CompanyJobOption[];
  nextCursor: string | null;
  query: ApplicantsQuery;
}

export interface ApplicantDetail {
  job: Job;
  row: RankedApplicant;
  prevId: string | null;
  nextId: string | null;
  resume: { fileName: string; text: string } | null;
}

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseApplicantsQuery(sp: Record<string, string | string[] | undefined>): ApplicantsQuery {
  const statusRaw = firstString(sp.status);
  const status: StatusFilter =
    statusRaw === "shortlisted" || statusRaw === "rejected" || statusRaw === "withdrawn" ? statusRaw : "active";
  const sortRaw = firstString(sp.sort);
  const sort: SortKey =
    sortRaw === "confidence" || sortRaw === "github" || sortRaw === "newest" || sortRaw === "oldest" ? sortRaw : "rank";
  const minRaw = Number(firstString(sp.minConfidence));
  const minConfidence = minRaw === 50 || minRaw === 70 || minRaw === 85 ? minRaw : null;
  const includeRaw = firstString(sp.includeIncomplete);
  const includeIncomplete = includeRaw !== "0" && includeRaw !== "false";
  const limitRaw = Number(firstString(sp.limit));
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 20;
  const cursor = firstString(sp.cursor) || null;
  return { status, sort, minConfidence, includeIncomplete, cursor, limit };
}

/** Query string that preserves filters. Omits defaults. Does not include limit or cursor. */
export function applicantsQueryString(query: Pick<ApplicantsQuery, "status" | "sort" | "minConfidence" | "includeIncomplete">): string {
  const params = new URLSearchParams();
  if (query.status !== "active") params.set("status", query.status);
  if (query.sort !== "rank") params.set("sort", query.sort);
  if (query.minConfidence) params.set("minConfidence", String(query.minConfidence));
  if (!query.includeIncomplete) params.set("includeIncomplete", "0");
  const value = params.toString();
  return value ? `?${value}` : "";
}

function securityOf(row: RankedApplicant): number {
  return row.repo?.scores?.security ?? 0;
}

/** Total order: tier, score, confidence, security, submittedAt, id. */
function compareRank(a: RankedApplicant, b: RankedApplicant): number {
  if (a.rank.tier !== b.rank.tier) return a.rank.tier - b.rank.tier;
  const score = (b.rank.score ?? -1) - (a.rank.score ?? -1);
  if (score !== 0) return score;
  const confidence = (b.fit.score ?? -1) - (a.fit.score ?? -1);
  if (confidence !== 0) return confidence;
  const security = securityOf(b) - securityOf(a);
  if (security !== 0) return security;
  const submitted = a.application.submittedAt.localeCompare(b.application.submittedAt);
  if (submitted !== 0) return submitted;
  return a.application.id.localeCompare(b.application.id);
}

function compareBy(sort: SortKey, a: RankedApplicant, b: RankedApplicant): number {
  if (sort === "confidence") {
    const confidence = (b.fit.score ?? -1) - (a.fit.score ?? -1);
    if (confidence !== 0) return confidence;
    return compareRank(a, b);
  }
  if (sort === "github") {
    const aOpen = a.repo?.status === "succeeded" ? 0 : 1;
    const bOpen = b.repo?.status === "succeeded" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    const overall = (b.repo?.overall ?? 0) - (a.repo?.overall ?? 0);
    if (overall !== 0) return overall;
    return compareRank(a, b);
  }
  if (sort === "newest") {
    const submitted = b.application.submittedAt.localeCompare(a.application.submittedAt);
    if (submitted !== 0) return submitted;
    return a.application.id.localeCompare(b.application.id);
  }
  if (sort === "oldest") {
    const submitted = a.application.submittedAt.localeCompare(b.application.submittedAt);
    if (submitted !== 0) return submitted;
    return a.application.id.localeCompare(b.application.id);
  }
  return compareRank(a, b);
}

function matchesStatus(status: ApplicationStatus, filter: StatusFilter): boolean {
  if (filter === "active") return status === "submitted" || status === "shortlisted";
  return status === filter;
}

function buildJob(jobId: string, companyId: string): { job: Job; all: RankedApplicant[]; companyJobs: CompanyJobOption[] } {
  const store = db();
  const job = store.jobs.find((item) => item.id === jobId);
  if (!job || job.companyId !== companyId) notFound();

  const companyJobs = store.jobs
    .filter((item) => item.companyId === companyId)
    .map((item) => ({
      id: item.id,
      title: item.title,
      applicantCount: store.applications.filter((application) => application.jobId === item.id).length,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const rows: RankedApplicant[] = [];
  for (const application of store.applications) {
    if (application.jobId !== job.id) continue;
    const person = store.applicants.find((applicant) => applicant.id === application.applicantId);
    if (!person) continue;

    const fitEval = application.fitEvaluationId
      ? store.fitEvaluations.find((fit) => fit.id === application.fitEvaluationId)
      : undefined;
    const fitSucceeded = fitEval?.status === "succeeded" && fitEval.confidenceScore != null;
    const repoEval = job.isTechnical ? store.repoEvaluations.find((repo) => repo.applicationId === application.id) : undefined;
    const githubReady = repoEval?.status === "succeeded" && repoEval.overall != null;

    let tier: RankTier = 0;
    if (!fitSucceeded) tier = 2;
    else if (job.isTechnical && !githubReady) tier = 1;

    const confidence = fitSucceeded ? fitEval.confidenceScore : null;
    const score = confidence == null ? null : rankScore(confidence, githubReady ? repoEval.overall : null, job.isTechnical);

    const repo: RecruiterRepo | null = job.isTechnical
      ? {
          status: repoEval?.status ?? "pending",
          scores: repoEval?.scores ?? null,
          overall: repoEval?.overall ?? null,
          rationale: repoEval?.rationale ?? {},
          repoFullName: repoEval?.repoFullName ?? application.githubRepoUrl?.replace("https://github.com/", "") ?? "Repository",
          repoUrl: repoEval?.repoUrl ?? application.githubRepoUrl ?? "",
          commitSha: repoEval?.commitSha ?? null,
          flags: repoEval?.flags ?? [],
          failureCode: repoEval?.failureCode ?? null,
        }
      : null;

    rows.push({
      application,
      applicant: {
        id: person.id,
        name: person.fullName,
        headline: person.headline,
        avatarUrl: person.avatarUrl,
      },
      fit: {
        score: confidence,
        status: fitEval?.status ?? null,
        explanation: fitSucceeded ? fitEval.explanation : null,
        requirements: fitSucceeded ? fitEval.requirements : [],
      },
      repo,
      rank: { tier, score, position: null },
    });
  }

  const ordered = [...rows].sort(compareRank);
  let position = 0;
  for (const row of ordered) {
    if (row.application.status === "withdrawn") row.rank.position = null;
    else {
      position += 1;
      row.rank.position = position;
    }
  }

  return { job, all: rows, companyJobs };
}

function countsOf(rows: RankedApplicant[]): PipelineCounts {
  let submitted = 0;
  let shortlisted = 0;
  let rejected = 0;
  let withdrawn = 0;
  let incomplete = 0;
  let unscored = 0;
  for (const row of rows) {
    if (row.application.status === "submitted") submitted += 1;
    else if (row.application.status === "shortlisted") shortlisted += 1;
    else if (row.application.status === "rejected") rejected += 1;
    else withdrawn += 1;
    if (row.rank.tier === 1) incomplete += 1;
    if (row.rank.tier === 2) unscored += 1;
  }
  return { active: submitted + shortlisted, new: submitted, shortlisted, rejected, withdrawn, incomplete, unscored };
}

function filterRows(rows: RankedApplicant[], query: ApplicantsQuery): RankedApplicant[] {
  return rows
    .filter((row) => matchesStatus(row.application.status, query.status))
    .filter((row) => query.includeIncomplete || row.rank.tier === 0)
    .filter((row) => query.minConfidence == null || (row.fit.score != null && row.fit.score >= query.minConfidence))
    .sort((a, b) => compareBy(query.sort, a, b));
}

function effectiveQuery(query: ApplicantsQuery, isTechnical: boolean): ApplicantsQuery {
  if (!isTechnical && query.sort === "github") return { ...query, sort: "rank" };
  return query;
}

export async function loadApplicantsPage(jobId: string, companyId: string, query: ApplicantsQuery): Promise<ApplicantsPageData> {
  const { job, all, companyJobs } = buildJob(jobId, companyId);
  const resolved = effectiveQuery(query, job.isTechnical);
  const filtered = filterRows(all, resolved);
  let start = 0;
  if (resolved.cursor) {
    const index = filtered.findIndex((row) => row.application.id === resolved.cursor);
    start = index >= 0 ? index + 1 : 0;
  }
  const page = filtered.slice(start, start + resolved.limit);
  const last = page[page.length - 1];
  const nextCursor = start + resolved.limit < filtered.length && last ? last.application.id : null;
  return {
    job,
    rows: page,
    total: filtered.length,
    counts: countsOf(all),
    tierCounts: {
      complete: filtered.filter((row) => row.rank.tier === 0).length,
      incomplete: filtered.filter((row) => row.rank.tier === 1).length,
      unscored: filtered.filter((row) => row.rank.tier === 2).length,
    },
    companyJobs,
    nextCursor,
    query: resolved,
  };
}

export async function loadApplicantDetail(
  jobId: string,
  companyId: string,
  applicationId: string,
  query: ApplicantsQuery,
): Promise<ApplicantDetail> {
  const store = db();
  const { job, all } = buildJob(jobId, companyId);
  const row = all.find((item) => item.application.id === applicationId);
  if (!row) notFound();

  const resolved = effectiveQuery(query, job.isTechnical);
  let sequence = filterRows(all, resolved);
  if (!sequence.some((item) => item.application.id === applicationId)) {
    sequence = [...all].sort((a, b) => compareBy(resolved.sort, a, b));
  }
  const index = sequence.findIndex((item) => item.application.id === applicationId);
  const person = store.applicants.find((applicant) => applicant.id === row.applicant.id);
  const text = person?.resume?.textContent ?? null;

  return {
    job,
    row,
    prevId: index > 0 ? sequence[index - 1].application.id : null,
    nextId: index >= 0 && index < sequence.length - 1 ? sequence[index + 1].application.id : null,
    resume: text && person?.resume ? { fileName: person.resume.fileName, text } : null,
  };
}
