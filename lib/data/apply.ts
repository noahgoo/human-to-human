import "server-only";
import { GptError } from "@/lib/ai/repo/gpt";
import { recruiterRepoFromReview } from "@/lib/ai/repo/recruiter-scores";
import type { GithubReviewOutcome } from "@/lib/ai/jev/evaluate";
import { CsvParseError, evaluateCandidate } from "@/lib/ai/jev/evaluate";
import { JevError } from "@/lib/ai/jev/client";
import { fitWriteup } from "@/lib/data/fit";
import { getTokenBalance } from "@/lib/data/tokens";
import { loadPublicRepo, type LoadedRepo } from "@/lib/github/public-projects";
import { db, newId } from "@/lib/mock/db";
import type { Application, FitEvaluation, RepoEvaluation, TokenCost } from "@/lib/types";

export interface ApplyBody {
  applicationId: string;
  balanceAfter: number;
}

export type ApplyOutcome =
  | { ok: true; status: 201; body: ApplyBody }
  | { ok: false; status: number; error: { code: string; message: string } };

type Stored = { fingerprint: string; body: ApplyBody };

const g = globalThis as unknown as { __npApplyIdem?: Map<string, Stored> };

function idempotencyStore() {
  if (!g.__npApplyIdem) g.__npApplyIdem = new Map();
  return g.__npApplyIdem;
}

/** `https://github.com/{owner}/{repo}`, stripping `.git`, trailing slash, and `/tree/...`. */
export function normalizeGithubRepoUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
  const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return `https://github.com/${owner}/${repo}`;
}

function fail(status: number, code: string, message: string): ApplyOutcome {
  return { ok: false, status, error: { code, message } };
}

export async function createApplication(input: {
  applicantId: string;
  jobId: string;
  githubRepoUrl?: string | null;
  expectedTokenCost: number;
  idempotencyKey: string | null;
  repoOwnershipAttested?: boolean;
}): Promise<ApplyOutcome> {
  if (!input.idempotencyKey?.trim()) {
    return fail(422, "VALIDATION_FAILED", "Idempotency-Key header is required.");
  }

  const store = db();
  const job = store.jobs.find((j) => j.id === input.jobId);
  if (!job) return fail(404, "NOT_FOUND", "We couldn't find that.");

  let repoUrl: string | null = null;
  if (job.isTechnical) {
    if (!input.githubRepoUrl?.trim()) {
      return fail(422, "VALIDATION_FAILED", "A public GitHub repository URL is required.");
    }
    if (/private|notfound/i.test(input.githubRepoUrl)) {
      return fail(422, "REPO_NOT_ACCESSIBLE", "We couldn't access that repository. Make sure it's public.");
    }
    const normalized = normalizeGithubRepoUrl(input.githubRepoUrl);
    if (!normalized) {
      return fail(422, "VALIDATION_FAILED", "Enter a URL like https://github.com/owner/repo.");
    }
    if (/private|notfound/i.test(normalized)) {
      return fail(422, "REPO_NOT_ACCESSIBLE", "We couldn't access that repository. Make sure it's public.");
    }
    if (!input.repoOwnershipAttested) {
      return fail(422, "VALIDATION_FAILED", "Confirm this repository is your own work.");
    }
    repoUrl = normalized;
  }

  const fingerprint = JSON.stringify({
    jobId: input.jobId,
    githubRepoUrl: repoUrl,
    expectedTokenCost: input.expectedTokenCost,
  });
  const storageKey = `${input.applicantId}:${input.idempotencyKey.trim()}`;
  const existing = idempotencyStore().get(storageKey);
  if (existing) {
    const stillThere = store.applications.some((a) => a.id === existing.body.applicationId);
    if (!stillThere) idempotencyStore().delete(storageKey);
    else if (existing.fingerprint !== fingerprint) {
      return fail(409, "IDEMPOTENCY_KEY_REUSED", "Please try submitting again.");
    } else {
      return { ok: true, status: 201, body: existing.body };
    }
  }

  const company = store.companies.find((c) => c.id === job.companyId);
  if (!company || company.verificationStatus !== "verified" || job.status !== "open") {
    return fail(409, "JOB_NOT_OPEN", "This job is no longer accepting applications.");
  }
  if (store.applications.some((a) => a.applicantId === input.applicantId && a.jobId === job.id)) {
    return fail(409, "ALREADY_APPLIED", "You've already applied to this job.");
  }
  if (input.expectedTokenCost !== job.tokenCost) {
    return fail(409, "CONFLICT", "Something changed. Please refresh and try again.");
  }

  const balance = await getTokenBalance(input.applicantId);
  if (balance.balance < job.tokenCost) {
    return fail(402, "INSUFFICIENT_TOKENS", "You don't have enough credits for this job.");
  }

  const applicant = store.applicants.find((item) => item.id === input.applicantId);
  const profileCsv = applicant?.linkedin?.profileCsv;
  const richMediaCsv = applicant?.linkedin?.richMediaCsv;
  const resumeText = applicant?.resume?.textContent ?? undefined;
  if (!profileCsv || !richMediaCsv || !resumeText) {
    return fail(422, "VALIDATION_FAILED", "A resume, LinkedIn profile, and rich media export are required.");
  }

  let loadedRepo: LoadedRepo | null = null;
  if (repoUrl) {
    const { owner, repo } = ownerAndRepo(repoUrl);
    try {
      loadedRepo = await loadPublicRepo(owner, repo);
    } catch {
      return fail(502, "GITHUB_UNAVAILABLE", "We couldn't reach GitHub to review that repository. Try again shortly.");
    }
    if (!loadedRepo) {
      return fail(422, "REPO_NOT_ACCESSIBLE", "We couldn't access that repository. Make sure it's public.");
    }
  }

  let evaluation;
  try {
    evaluation = await evaluateCandidate({
      jobTitle: job.title,
      jobRequirements: job.requirements,
      profileCsv,
      richMediaCsv,
      connectionsCsv: connectionsCsv(input.applicantId),
      resumeText,
      submittedRepo: loadedRepo,
    });
  } catch (error) {
    return evaluationError(error);
  }

  const now = new Date().toISOString();
  const written = fitWriteup(evaluation, job, Boolean(loadedRepo));
  const fit: FitEvaluation = {
    id: newId("fit"),
    jobId: job.id,
    applicantId: input.applicantId,
    status: "succeeded",
    confidenceScore: evaluation.confidenceScore,
    band: evaluation.band,
    explanation: written.explanation,
    requirements: written.requirements,
    sourceScores: written.sourceScores,
    createdAt: now,
  };
  store.fitEvaluations.push(fit);

  const application: Application = {
    id: newId("app"),
    jobId: job.id,
    applicantId: input.applicantId,
    status: "submitted",
    tokenCost: job.tokenCost as TokenCost,
    githubRepoUrl: repoUrl,
    submittedAt: now,
    updatedAt: now,
    fitEvaluationId: fit.id,
    events: [{ fromStatus: null, toStatus: "submitted", at: now }],
  };
  store.applications.push(application);

  if (loadedRepo) {
    store.repoEvaluations.push(repoEvaluation(application.id, loadedRepo, evaluation.githubReview));
  }

  const after = await getTokenBalance(input.applicantId);
  const body: ApplyBody = { applicationId: application.id, balanceAfter: after.balance };
  idempotencyStore().set(storageKey, { fingerprint, body });
  return { ok: true, status: 201, body };
}

function ownerAndRepo(url: string): { owner: string; repo: string } {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return { owner: parts[0] ?? "", repo: parts[1] ?? "" };
}

function connectionsCsv(applicantId: string): string {
  const lines = db()
    .connections.filter((row) => row.ownerId === applicantId)
    .map((row) => [row.firstName, row.lastName, row.companyName, row.position ?? ""].map(csvCell).join(","));
  return ["First Name,Last Name,Company,Position", ...lines].join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function evaluationError(error: unknown): ApplyOutcome {
  if (error instanceof CsvParseError) return fail(422, "VALIDATION_FAILED", error.message);
  if ((error instanceof JevError || error instanceof GptError) && error.code === "missing_key") {
    return fail(503, "SERVICE_UNAVAILABLE", "Scoring is unavailable right now. Try again shortly.");
  }
  if (error instanceof JevError || error instanceof GptError) {
    return fail(502, "OPENROUTER_UNAVAILABLE", "We couldn't finish the evaluation. Try again shortly.");
  }
  return fail(500, "INTERNAL", "Something went wrong on our side.");
}

function repoEvaluation(applicationId: string, repo: LoadedRepo, review: GithubReviewOutcome): RepoEvaluation {
  const base = {
    id: newId("repo"),
    applicationId,
    repoUrl: `https://github.com/${repo.fullName}`,
    repoFullName: repo.fullName,
    commitSha: repo.commitSha,
    flags: repo.isFork ? ["fork"] : [],
  };
  if (review && review.status === "succeeded") {
    const mapped = recruiterRepoFromReview(review);
    return {
      ...base,
      status: "succeeded",
      scores: mapped.scores,
      overall: mapped.overall,
      rationale: mapped.rationale,
      gaps: mapped.gaps,
      failureCode: null,
    };
  }
  return {
    ...base,
    status: "failed",
    scores: null,
    overall: null,
    rationale: {},
    gaps: null,
    failureCode: "review_failed",
  };
}
