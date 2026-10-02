import "server-only";
import { db } from "@/lib/mock/db";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadLivePipeline, type LivePipeline } from "@/lib/data/live-store";
import { loadPipelineRowsFromSupabase } from "@/lib/data/pipeline-supabase";
import { jevScoresFromFit } from "@/lib/data/scoring";
import { rankScore } from "@/lib/ranking/bands";
import type {
  Application,
  ApplicationStatus,
  EvaluationStatus,
  FitRequirement,
  Job,
  RepoCategory,
} from "@/lib/types";

export type RankTier = 0 | 1 | 2;
export type PipelineStatusFilter = "active" | "shortlisted" | "rejected" | "withdrawn";
export type PipelineSort = "rank" | "confidence" | "github" | "newest" | "oldest";
export type MinConfidence = 50 | 70 | 85;

export interface RecruiterRepo {
  status: EvaluationStatus;
  scores: Record<RepoCategory, number> | null;
  overall: number | null;
  rationale: Partial<Record<RepoCategory, string>>;
  gaps?: string | null;
  repoFullName: string;
  repoUrl: string | null;
  commitSha: string | null;
  flags: string[];
  failureCode: string | null;
}

export interface RankedApplicant {
  application: Application;
  applicant: {
    id: string;
    name: string;
    headline: string | null;
    avatarUrl: string | null;
  };
  fit: {
    score: number | null;
    status: EvaluationStatus | null;
    explanation: string | null;
    requirements: FitRequirement[];
    jev: {
      richMedia: number | null;
      profile: number | null;
      resume: number | null;
    };
  };
  repo: RecruiterRepo | null;
  rank: {
    tier: RankTier;
    score: number | null;
    position: number | null;
  };
}

export interface PipelineCounts {
  active: number;
  /** Submitted applications. */
  new: number;
  shortlisted: number;
  rejected: number;
  withdrawn: number;
  incomplete: number;
  unscored: number;
}

export interface ApplicantsQuery {
  status: PipelineStatusFilter;
  sort: PipelineSort;
  minConfidence: MinConfidence | null;
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
  matchCount: number;
  tierCounts: Record<RankTier, number>;
  counts: PipelineCounts;
  companyJobs: CompanyJobOption[];
  nextCursor: string | null;
}

export interface ApplicantResume {
  available: boolean;
  fileName: string | null;
  textContent: string | null;
}

export interface ApplicantDetail {
  job: Job;
  row: RankedApplicant;
  resume: ApplicantResume;
  prevId: string | null;
  nextId: string | null;
}

const STATUS_FILTERS: PipelineStatusFilter[] = ["active", "shortlisted", "rejected", "withdrawn"];
const SORTS: PipelineSort[] = ["rank", "confidence", "github", "newest", "oldest"];

interface Scored extends RankedApplicant {
  confidence: number | null;
  codeQuality: number | null;
  githubOverall: number | null;
  githubSucceeded: boolean;
}

function firstParam(sp: Record<string, string | string[] | undefined>, key: string) {
  const value = sp[key];
  return Array.isArray(value) ? value[0] : value;
}

export function parseApplicantsQuery(sp: Record<string, string | string[] | undefined>): ApplicantsQuery {
  const status = firstParam(sp, "status");
  const sort = firstParam(sp, "sort");
  const min = firstParam(sp, "min");
  const limit = Number(firstParam(sp, "limit"));
  return {
    status: STATUS_FILTERS.includes(status as PipelineStatusFilter) ? (status as PipelineStatusFilter) : "active",
    sort: SORTS.includes(sort as PipelineSort) ? (sort as PipelineSort) : "rank",
    minConfidence: min === "50" || min === "70" || min === "85" ? (Number(min) as MinConfidence) : null,
    includeIncomplete: firstParam(sp, "incomplete") !== "0",
    cursor: firstParam(sp, "cursor") ?? null,
    limit: Number.isFinite(limit) && limit >= 1 ? Math.min(Math.floor(limit), 100) : 20,
  };
}

/** URL search string. Omits defaults. Pass `limit` to override pagination. */
export function applicantsQueryString(query: ApplicantsQuery, limit = query.limit): string {
  const params = new URLSearchParams();
  if (query.status !== "active") params.set("status", query.status);
  if (query.sort !== "rank") params.set("sort", query.sort);
  if (query.minConfidence) params.set("min", String(query.minConfidence));
  if (!query.includeIncomplete) params.set("incomplete", "0");
  if (limit !== 20) params.set("limit", String(limit));
  return params.toString();
}

type PipelineSource = Pick<LivePipeline, "applications" | "applicants" | "fitEvaluations" | "repoEvaluations">;

function findJob(jobId: string, companyId: string): Job | null {
  return db().jobs.find((item) => item.id === jobId && item.companyId === companyId) ?? null;
}

/** Null when the job is missing or belongs to another company. Pages render not-found from this. */
export async function loadRecruiterJob(jobId: string, companyId: string): Promise<Job | null> {
  if (isSupabaseConfigured()) {
    const live = await loadLivePipeline(jobId, companyId);
    return live?.job ?? null;
  }
  return findJob(jobId, companyId);
}

function matchesStatus(status: ApplicationStatus, filter: PipelineStatusFilter) {
  if (filter === "active") return status === "submitted" || status === "shortlisted";
  return status === filter;
}

function compareRank(a: Scored, b: Scored) {
  if (a.rank.tier !== b.rank.tier) return a.rank.tier - b.rank.tier;
  const byScore = (b.rank.score ?? -1) - (a.rank.score ?? -1);
  if (byScore !== 0) return byScore;
  const byConfidence = (b.confidence ?? -1) - (a.confidence ?? -1);
  if (byConfidence !== 0) return byConfidence;
  const byCodeQuality = (b.codeQuality ?? -1) - (a.codeQuality ?? -1);
  if (byCodeQuality !== 0) return byCodeQuality;
  if (a.application.submittedAt !== b.application.submittedAt) {
    return a.application.submittedAt < b.application.submittedAt ? -1 : 1;
  }
  return a.application.id < b.application.id ? -1 : a.application.id > b.application.id ? 1 : 0;
}

function compareApplicants(sort: PipelineSort) {
  return (a: Scored, b: Scored) => {
    if (sort === "confidence") {
      const byConfidence = (b.confidence ?? -1) - (a.confidence ?? -1);
      if (byConfidence !== 0) return byConfidence;
      return compareRank(a, b);
    }
    if (sort === "github") {
      const byStatus = Number(b.githubSucceeded) - Number(a.githubSucceeded);
      if (byStatus !== 0) return byStatus;
      const byOverall = (b.githubOverall ?? -1) - (a.githubOverall ?? -1);
      if (byOverall !== 0) return byOverall;
      const byScore = (b.rank.score ?? -1) - (a.rank.score ?? -1);
      if (byScore !== 0) return byScore;
      const byConfidence = (b.confidence ?? -1) - (a.confidence ?? -1);
      if (byConfidence !== 0) return byConfidence;
      if (a.application.submittedAt !== b.application.submittedAt) {
        return a.application.submittedAt < b.application.submittedAt ? -1 : 1;
      }
      return a.application.id < b.application.id ? -1 : 1;
    }
    if (sort === "newest" || sort === "oldest") {
      if (a.application.submittedAt !== b.application.submittedAt) {
        const earlierFirst = a.application.submittedAt < b.application.submittedAt ? -1 : 1;
        return sort === "oldest" ? earlierFirst : -earlierFirst;
      }
      return a.application.id < b.application.id ? -1 : 1;
    }
    return compareRank(a, b);
  };
}

function toPublic(row: Scored): RankedApplicant {
  return {
    application: row.application,
    applicant: row.applicant,
    fit: row.fit,
    repo: row.repo,
    rank: row.rank,
  };
}

function buildRows(job: Job, source?: PipelineSource): Scored[] {
  const store = source ?? db();
  const rows: Scored[] = store.applications
    .filter((application) => application.jobId === job.id)
    .map((application) => {
      const person = store.applicants.find((item) => item.id === application.applicantId);
      const fitEval = application.fitEvaluationId
        ? store.fitEvaluations.find((item) => item.id === application.fitEvaluationId)
        : undefined;
      const fitSucceeded = fitEval?.status === "succeeded" && fitEval.confidenceScore != null;
      const jev = jevScoresFromFit(fitEval);
      const fit = {
        score: fitSucceeded ? fitEval.confidenceScore : null,
        status: fitEval?.status ?? null,
        explanation: fitSucceeded ? fitEval.explanation : null,
        requirements: fitSucceeded ? fitEval.requirements : [],
        jev: {
          richMedia: jev.richMedia,
          profile: jev.profile,
          resume: jev.resume,
        },
      };

      let repo: RecruiterRepo | null = null;
      if (job.isTechnical) {
        const raw = store.repoEvaluations.find((item) => item.applicationId === application.id);
        repo = raw
          ? {
              status: raw.status,
              scores: raw.scores,
              overall: raw.overall,
              rationale: raw.rationale,
              gaps: raw.gaps ?? null,
              repoFullName: raw.repoFullName,
              repoUrl: raw.repoUrl,
              commitSha: raw.commitSha,
              flags: raw.flags,
              failureCode: raw.failureCode,
            }
          : {
              status: "pending",
              scores: null,
              overall: null,
              rationale: {},
              repoFullName: application.githubRepoUrl?.replace(/^https:\/\/github.com\//, "") ?? "Repository",
              repoUrl: application.githubRepoUrl,
              commitSha: null,
              flags: [],
              failureCode: null,
            };
      }

      const githubSucceeded = Boolean(repo && repo.status === "succeeded" && repo.overall != null);
      let tier: RankTier = 0;
      if (!fitSucceeded) tier = 2;
      else if (job.isTechnical && !githubSucceeded) tier = 1;

      const score =
        fitSucceeded && fit.score != null
          ? rankScore(fit.score, githubSucceeded ? repo?.overall ?? null : null, job.isTechnical)
          : null;

      return {
        application,
        applicant: {
          id: application.applicantId,
          name: person?.fullName ?? "Applicant",
          headline: person?.headline ?? null,
          avatarUrl: person?.avatarUrl ?? null,
        },
        fit,
        repo,
        rank: { tier, score, position: null },
        confidence: fit.score,
        codeQuality: repo?.scores?.codeQuality ?? null,
        githubOverall: githubSucceeded ? repo?.overall ?? null : null,
        githubSucceeded,
      };
    });

  const ranked = [...rows].sort(compareRank);
  let position = 0;
  for (const row of ranked) {
    if (row.application.status === "withdrawn") row.rank.position = null;
    else {
      position += 1;
      row.rank.position = position;
    }
  }
  return rows;
}

function countsFor(rows: Scored[]): PipelineCounts {
  const counts: PipelineCounts = {
    active: 0,
    new: 0,
    shortlisted: 0,
    rejected: 0,
    withdrawn: 0,
    incomplete: 0,
    unscored: 0,
  };
  for (const row of rows) {
    if (row.application.status === "submitted") {
      counts.new += 1;
      counts.active += 1;
    } else if (row.application.status === "shortlisted") {
      counts.shortlisted += 1;
      counts.active += 1;
    } else if (row.application.status === "rejected") counts.rejected += 1;
    else counts.withdrawn += 1;
    if (row.rank.tier === 1) counts.incomplete += 1;
    if (row.rank.tier === 2) counts.unscored += 1;
  }
  return counts;
}

function companyJobs(companyId: string): CompanyJobOption[] {
  const store = db();
  return store.jobs
    .filter((job) => job.companyId === companyId)
    .map((job) => ({
      id: job.id,
      title: job.title,
      applicantCount: store.applications.filter((application) => application.jobId === job.id).length,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function passesFilters(row: Scored, query: ApplicantsQuery) {
  if (!matchesStatus(row.application.status, query.status)) return false;
  if (query.minConfidence != null && (row.confidence == null || row.confidence < query.minConfidence)) return false;
  if (!query.includeIncomplete && row.rank.tier !== 0) return false;
  return true;
}

function effectiveSort(job: Job, sort: PipelineSort): PipelineSort {
  if (sort === "github" && !job.isTechnical) return "rank";
  return sort;
}

export async function loadApplicantsPage(
  jobId: string,
  companyId: string,
  query: ApplicantsQuery,
): Promise<ApplicantsPageData | null> {
  if (isSupabaseConfigured()) {
    const live = await loadLivePipeline(jobId, companyId);
    if (!live) return null;
    return assembleApplicantsPage(live.job, buildRows(live.job, live), query, live.companyJobs);
  }
  const job = findJob(jobId, companyId);
  if (!job) return null;
  await loadPipelineRowsFromSupabase(jobId, companyId);
  const all = buildRows(job);
  return assembleApplicantsPage(job, all, query, companyJobs(companyId));
}

function assembleApplicantsPage(
  job: Job,
  all: Scored[],
  query: ApplicantsQuery,
  companyJobOptions: CompanyJobOption[],
): ApplicantsPageData {
  const sort = effectiveSort(job, query.sort);
  const filtered = all.filter((row) => passesFilters(row, query)).sort(compareApplicants(sort));
  const tierCounts: Record<RankTier, number> = { 0: 0, 1: 0, 2: 0 };
  for (const row of filtered) tierCounts[row.rank.tier] += 1;

  let start = 0;
  if (query.cursor) {
    const index = filtered.findIndex((row) => row.application.id === query.cursor);
    if (index >= 0) start = index + 1;
  }
  const slice = filtered.slice(start, start + query.limit);
  const hasMore = start + query.limit < filtered.length;

  return {
    job,
    rows: slice.map(toPublic),
    matchCount: filtered.length,
    tierCounts,
    counts: countsFor(all),
    companyJobs: companyJobOptions,
    nextCursor: hasMore ? slice[slice.length - 1]?.application.id ?? null : null,
  };
}

export async function loadApplicantDetail(
  jobId: string,
  companyId: string,
  applicationId: string,
  query: ApplicantsQuery,
): Promise<ApplicantDetail | null> {
  const live = isSupabaseConfigured() ? await loadLivePipeline(jobId, companyId) : null;
  const job = live?.job ?? findJob(jobId, companyId);
  if (!job) return null;
  const all = buildRows(job, live ?? undefined);
  const row = all.find((item) => item.application.id === applicationId);
  if (!row) return null;

  const sort = effectiveSort(job, query.sort);
  let ordered = all.filter((item) => passesFilters(item, query)).sort(compareApplicants(sort));
  let index = ordered.findIndex((item) => item.application.id === applicationId);
  if (index === -1) {
    ordered = [...all].sort(compareRank);
    index = ordered.findIndex((item) => item.application.id === applicationId);
  }

  const person = (live?.applicants ?? db().applicants).find((item) => item.id === row.applicant.id);
  const textContent = person?.resume?.textContent ?? null;

  return {
    job,
    row: toPublic(row),
    resume: {
      available: textContent != null && textContent.length > 0,
      fileName: person?.resume?.fileName ?? null,
      textContent,
    },
    prevId: index > 0 ? ordered[index - 1].application.id : null,
    nextId: index >= 0 && index < ordered.length - 1 ? ordered[index + 1].application.id : null,
  };
}
