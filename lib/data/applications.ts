import "server-only";
import type { ApplicationStatus, TokenCost, WorkMode } from "@/lib/types";
import { db } from "@/lib/mock/db";

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
    events: application.events.map((event) => ({ toStatus: event.toStatus, at: event.at })),
  };
}
