import "server-only";
import { bandFor } from "@/lib/ranking/bands";
import { db, newId } from "@/lib/mock/db";
import type { FitEvaluation, FitRequirement, Job } from "@/lib/types";

const FRESH_MS = 24 * 60 * 60 * 1000;
const SETTLE_MS = 3_500;

/** Deterministic 35–95 score from job + applicant, stable across requests. */
export function scoreFor(jobId: string, userId: string): number {
  let h = 2166136261;
  const s = `${jobId}:${userId}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 35 + ((h >>> 0) % 61);
}

function requirementLines(requirements: string): string[] {
  const lines = requirements
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bullets = lines.filter((line) => line.startsWith("- ")).map((line) => line.slice(2).trim());
  const cleaned = bullets.filter(Boolean);
  if (cleaned.length) return cleaned;
  return lines.length ? lines : ["Listed requirements"];
}

function metFor(requirement: string, score: number, index: number): FitRequirement["met"] {
  let h = 0;
  const s = `${requirement}:${index}`;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  const bucket = h % 100;
  if (score >= 80) return bucket < 70 ? "yes" : "partial";
  if (score >= 60) return bucket < 40 ? "yes" : bucket < 75 ? "partial" : "no";
  if (score >= 45) return bucket < 25 ? "yes" : bucket < 60 ? "partial" : "no";
  return bucket < 35 ? "partial" : "no";
}

function explanationFor(score: number, title: string, company: string): string {
  const overlap =
    score >= 85 ? "strong overlap" : score >= 70 ? "solid overlap" : score >= 50 ? "partial overlap" : "limited overlap";
  return `Comparing your resume and LinkedIn export with the ${title} role at ${company} shows ${overlap}. Several requirements are evidenced by your recent roles, and a few are only partly covered or not shown. This free estimate helps you decide whether spending credits is worthwhile. Recruiters see a separate evaluation, and a person makes every hiring decision.`;
}

function buildRequirements(job: Job, score: number): FitRequirement[] {
  return requirementLines(job.requirements).map((requirement, index) => {
    const met = metFor(requirement, score, index);
    const evidence =
      met === "yes"
        ? "Supported by your resume and recent roles."
        : met === "partial"
          ? "Some related experience, not a direct match."
          : null;
    return { requirement, met, evidence };
  });
}

/** After ~3.5s a pending row becomes a succeeded evaluation. Mutates the store row. */
export function materializeFit(fit: FitEvaluation): FitEvaluation {
  if (fit.status === "succeeded" || fit.status === "failed") return fit;
  if (Date.now() - Date.parse(fit.createdAt) < SETTLE_MS) return fit;
  const job = db().jobs.find((j) => j.id === fit.jobId);
  if (!job) {
    fit.status = "failed";
    return fit;
  }
  const company = db().companies.find((c) => c.id === job.companyId);
  const score = scoreFor(fit.jobId, fit.applicantId);
  fit.status = "succeeded";
  fit.confidenceScore = score;
  fit.band = bandFor(score);
  fit.explanation = explanationFor(score, job.title, company?.name ?? "the company");
  fit.requirements = buildRequirements(job, score);
  return fit;
}

export function freshSucceededFit(jobId: string, applicantId: string): FitEvaluation | undefined {
  const cutoff = Date.now() - FRESH_MS;
  return db()
    .fitEvaluations.filter(
      (f) =>
        f.jobId === jobId &&
        f.applicantId === applicantId &&
        f.status === "succeeded" &&
        Date.parse(f.createdAt) >= cutoff,
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

export function createPendingFit(jobId: string, applicantId: string): FitEvaluation {
  const fit: FitEvaluation = {
    id: newId("fit"),
    jobId,
    applicantId,
    status: "pending",
    confidenceScore: null,
    band: null,
    explanation: null,
    requirements: [],
    createdAt: new Date().toISOString(),
  };
  db().fitEvaluations.push(fit);
  return fit;
}

export function getFitForApplicant(id: string, applicantId: string): FitEvaluation | undefined {
  const fit = db().fitEvaluations.find((f) => f.id === id && f.applicantId === applicantId);
  if (!fit) return undefined;
  return materializeFit(fit);
}

export function toFitDto(fit: FitEvaluation) {
  return {
    id: fit.id,
    jobId: fit.jobId,
    status: fit.status,
    confidenceScore: fit.confidenceScore,
    band: fit.band,
    explanation: fit.explanation,
    requirements: fit.requirements,
    createdAt: fit.createdAt,
  };
}

export function connectionsAtCompany(applicantId: string, companyName: string) {
  const target = companyName.trim().toLowerCase();
  const data = db()
    .connections.filter((c) => c.ownerId === applicantId && c.companyName.trim().toLowerCase() === target)
    .map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      position: c.position,
    }));
  return { data, total: data.length };
}
