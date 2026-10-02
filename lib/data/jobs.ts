import "server-only";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/mock/db";
import type { Application, ApplicationStatus, FitEvaluation, JobWithCompany, TokenCost } from "@/lib/types";

export interface JobListFilters {
  q?: string;
  technical?: boolean;
  maxCost?: 1 | 2 | 3;
}

export interface ApplicantApplicationCard {
  id: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  status: ApplicationStatus;
  submittedAt: string;
  tokenCost: TokenCost;
}

function companyOf(companyId: string) {
  return db().companies.find((c) => c.id === companyId) ?? null;
}

/** Open jobs at verified companies, newest first. `q` matches title or company name. */
export function listOpenJobs(filters: JobListFilters = {}): JobWithCompany[] {
  const q = filters.q?.trim().toLowerCase();
  const store = db();
  return store.jobs
    .filter((job) => job.status === "open")
    .map((job) => {
      const company = companyOf(job.companyId);
      if (!company || company.verificationStatus !== "verified") return null;
      return {
        ...job,
        company: {
          id: company.id,
          name: company.name,
          logoUrl: company.logoUrl,
          verificationStatus: company.verificationStatus,
        },
      } satisfies JobWithCompany;
    })
    .filter((job): job is JobWithCompany => job != null)
    .filter((job) => {
      if (filters.technical && !job.isTechnical) return false;
      if (filters.maxCost != null && job.tokenCost > filters.maxCost) return false;
      if (q && !`${job.title} ${job.company.name}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.publishedAt ?? b.createdAt) - Date.parse(a.publishedAt ?? a.createdAt));
}

/**
 * Visible job detail. Open + verified company, or a closed job the applicant already applied to.
 * Anything else is a 404.
 */
export function getJobForApplicant(jobId: string, applicantId: string): JobWithCompany | null {
  const store = db();
  const job = store.jobs.find((j) => j.id === jobId);
  if (!job) return null;
  const company = companyOf(job.companyId);
  if (!company || company.verificationStatus !== "verified") return null;
  const applied = store.applications.some((a) => a.jobId === jobId && a.applicantId === applicantId);
  if (job.status !== "open" && !(job.status === "closed" && applied)) return null;
  return {
    ...job,
    company: {
      id: company.id,
      name: company.name,
      logoUrl: company.logoUrl,
      verificationStatus: company.verificationStatus,
    },
  };
}

export function listApplicantApplications(applicantId: string): ApplicantApplicationCard[] {
  const store = db();
  return store.applications
    .filter((a) => a.applicantId === applicantId)
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))
    .map((application) => {
      const job = store.jobs.find((j) => j.id === application.jobId);
      const company = job ? companyOf(job.companyId) : null;
      return {
        id: application.id,
        jobId: application.jobId,
        jobTitle: job?.title ?? "Role",
        companyName: company?.name ?? "Company",
        status: application.status,
        submittedAt: application.submittedAt,
        tokenCost: application.tokenCost,
      };
    });
}

export function getApplicationForJob(applicantId: string, jobId: string): Application | undefined {
  return db()
    .applications.filter((a) => a.applicantId === applicantId && a.jobId === jobId)
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))[0];
}

/** Latest succeeded fit per job for this applicant. */
export function getLatestSucceededFits(applicantId: string): Map<string, FitEvaluation> {
  const fits = db()
    .fitEvaluations.filter((f) => f.applicantId === applicantId && f.status === "succeeded")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const map = new Map<string, FitEvaluation>();
  for (const fit of fits) {
    if (!map.has(fit.jobId)) map.set(fit.jobId, fit);
  }
  return map;
}

export function applicantHasLinkedIn(applicantId: string): boolean {
  const applicant = db().applicants.find((a) => a.id === applicantId);
  return Boolean(
    applicant?.linkedin &&
      applicant.linkedin.status === "succeeded" &&
      applicant.linkedin.filesPresent.includes("Connections"),
  );
}

export async function requireApplicant() {
  const session = await getSession();
  if (!session) return { ok: false as const, status: 401, code: "UNAUTHENTICATED" };
  if (session.role !== "applicant" || !session.onboarded) {
    return { ok: false as const, status: 403, code: "FORBIDDEN" };
  }
  return { ok: true as const, session };
}
