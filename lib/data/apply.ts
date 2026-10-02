import "server-only";
import { db, newId } from "@/lib/mock/db";
import { getTokenBalance } from "@/lib/data/tokens";
import type { Application, TokenCost } from "@/lib/types";

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

  const latestFit = store.fitEvaluations
    .filter((f) => f.applicantId === input.applicantId && f.jobId === job.id && f.status === "succeeded")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  const now = new Date().toISOString();
  const application: Application = {
    id: newId("app"),
    jobId: job.id,
    applicantId: input.applicantId,
    status: "submitted",
    tokenCost: job.tokenCost as TokenCost,
    githubRepoUrl: repoUrl,
    submittedAt: now,
    updatedAt: now,
    fitEvaluationId: latestFit?.id ?? null,
    events: [{ fromStatus: null, toStatus: "submitted", at: now }],
  };
  store.applications.push(application);

  const after = await getTokenBalance(input.applicantId);
  const body: ApplyBody = { applicationId: application.id, balanceAfter: after.balance };
  idempotencyStore().set(storageKey, { fingerprint, body });
  return { ok: true, status: 201, body };
}
