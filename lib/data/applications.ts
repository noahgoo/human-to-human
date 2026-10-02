import "server-only";
import type { ApplicationStatus, EvaluationStatus, FitEvaluation, RepoCategory, TokenCost, WorkMode } from "@/lib/types";
import { db } from "@/lib/mock/db";

export interface StoredRepoScore {
  status: EvaluationStatus;
  scores: Record<RepoCategory, number> | null;
  overall: number | null;
  rationale: Partial<Record<RepoCategory, string>>;
  repoFullName: string;
  commitSha: string | null;
  flags: string[];
  failureCode: string | null;
}

export interface SavedJevScores {
  richMedia: number | null;
  profile: number | null;
  resume: number | null;
  average: number | null;
}

export interface MyApplicationListItem {
  id: string;
  jobTitle: string;
  companyName: string;
  companyLogoUrl: string | null;
  status: ApplicationStatus;
  submittedAt: string;
  tokenCost: TokenCost;
  isTechnical: boolean;
}

export interface MyApplicationDetail {
  id: string;
  jobTitle: string;
  companyName: string;
  companyLogoUrl: string | null;
  location: string | null;
  workMode: WorkMode | null;
  status: ApplicationStatus;
  submittedAt: string;
  tokenCost: TokenCost;
  isTechnical: boolean;
  githubRepoUrl: string | null;
  jev: SavedJevScores;
  repo: StoredRepoScore | null;
  events: { toStatus: ApplicationStatus; at: string }[];
}

export async function listMyApplications(applicantId: string): Promise<MyApplicationListItem[]> {
  const store = db();
  return store.applications
    .filter((application) => application.applicantId === applicantId)
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))
    .map((application) => {
      const job = store.jobs.find((item) => item.id === application.jobId);
      const company = job ? store.companies.find((item) => item.id === job.companyId) : undefined;
      return {
        id: application.id,
        jobTitle: job?.title ?? "Untitled role",
        companyName: company?.name ?? "Company",
        companyLogoUrl: company?.logoUrl ?? null,
        status: application.status,
        submittedAt: application.submittedAt,
        tokenCost: application.tokenCost,
        isTechnical: Boolean(job?.isTechnical),
      };
    });
}

export async function getMyApplication(applicantId: string, applicationId: string): Promise<MyApplicationDetail | null> {
  const store = db();
  const application = store.applications.find((item) => item.id === applicationId);
  if (!application || application.applicantId !== applicantId) return null;
  const job = store.jobs.find((item) => item.id === application.jobId);
  const company = job ? store.companies.find((item) => item.id === job.companyId) : undefined;
  return {
    id: application.id,
    jobTitle: job?.title ?? "Untitled role",
    companyName: company?.name ?? "Company",
    companyLogoUrl: company?.logoUrl ?? null,
    location: job?.location ?? null,
    workMode: job?.workMode ?? null,
    status: application.status,
    submittedAt: application.submittedAt,
    tokenCost: application.tokenCost,
    isTechnical: Boolean(job?.isTechnical),
    githubRepoUrl: application.githubRepoUrl,
    jev: jevScores(store.fitEvaluations.find((item) => item.id === application.fitEvaluationId)),
    repo: job?.isTechnical ? storedRepo(application.id) : null,
    events: application.events.map((event) => ({ toStatus: event.toStatus, at: event.at })),
  };
}

const JEV_LABEL = {
  richMedia: "LinkedIn rich media",
  profile: "LinkedIn profile",
  resume: "Resume",
} as const;

function jevScores(fit: FitEvaluation | undefined): SavedJevScores {
  const saved = fit?.sourceScores;
  const succeeded = fit?.status === "succeeded";
  return {
    richMedia: saved?.richMedia ?? scoreFromEvidence(fit, JEV_LABEL.richMedia),
    profile: saved?.profile ?? scoreFromEvidence(fit, JEV_LABEL.profile),
    resume: saved?.resume ?? scoreFromEvidence(fit, JEV_LABEL.resume),
    average: succeeded ? (fit?.confidenceScore ?? null) : null,
  };
}

function scoreFromEvidence(fit: FitEvaluation | undefined, label: string): number | null {
  const evidence = fit?.requirements.find((item) => item.requirement === label)?.evidence;
  const match = evidence?.match(/Jev score (\d+)/);
  return match ? Number(match[1]) : null;
}

function storedRepo(applicationId: string): StoredRepoScore | null {
  const raw = db().repoEvaluations.find((item) => item.applicationId === applicationId);
  if (!raw) return null;
  return {
    status: raw.status,
    scores: raw.scores,
    overall: raw.overall,
    rationale: raw.rationale,
    repoFullName: raw.repoFullName,
    commitSha: raw.commitSha,
    flags: raw.flags,
    failureCode: raw.failureCode,
  };
}
