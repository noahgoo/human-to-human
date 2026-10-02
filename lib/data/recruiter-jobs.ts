import "server-only";
import type { Job, JobStatus, TokenCost } from "@/lib/types";
import { db, delay } from "@/lib/mock/db";

export interface RecruiterJobRow {
  id: string;
  title: string;
  status: JobStatus;
  isTechnical: boolean;
  tokenCost: TokenCost;
  publishedAt: string | null;
  activeCount: number;
  newCount: number;
  applicationCount: number;
  unactedCount: number;
}

export interface RecruiterJobsSnapshot {
  jobs: RecruiterJobRow[];
  metrics: {
    openJobs: number;
    totalApplicants: number;
    newApplicants: number;
    shortlisted: number;
  };
}

const STATUS_ORDER: Record<JobStatus, number> = { open: 0, draft: 1, closed: 2, archived: 3 };

export async function listRecruiterJobs(companyId: string): Promise<RecruiterJobsSnapshot> {
  await delay();
  const store = db();
  const jobs = store.jobs.filter((job) => job.companyId === companyId);
  const rows: RecruiterJobRow[] = jobs.map((job) => {
    const apps = store.applications.filter((a) => a.jobId === job.id);
    return {
      id: job.id,
      title: job.title,
      status: job.status,
      isTechnical: job.isTechnical,
      tokenCost: job.tokenCost,
      publishedAt: job.publishedAt,
      applicationCount: apps.length,
      activeCount: apps.filter((a) => a.status === "submitted" || a.status === "shortlisted").length,
      newCount: apps.filter((a) => a.status === "submitted").length,
      unactedCount: apps.filter((a) => a.status === "submitted").length,
    };
  });
  rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.publishedAt?.localeCompare(a.publishedAt ?? "") || a.title.localeCompare(b.title));

  const companyApps = store.applications.filter((a) => jobs.some((job) => job.id === a.jobId));
  return {
    jobs: rows,
    metrics: {
      openJobs: rows.filter((job) => job.status === "open").length,
      totalApplicants: companyApps.length,
      newApplicants: companyApps.filter((a) => a.status === "submitted").length,
      shortlisted: companyApps.filter((a) => a.status === "shortlisted").length,
    },
  };
}

export async function getRecruiterJob(companyId: string, jobId: string): Promise<{ job: Job; applicationCount: number; unactedCount: number } | null> {
  await delay();
  const store = db();
  const job = store.jobs.find((item) => item.id === jobId && item.companyId === companyId);
  if (!job) return null;
  const apps = store.applications.filter((a) => a.jobId === job.id);
  return {
    job,
    applicationCount: apps.length,
    unactedCount: apps.filter((a) => a.status === "submitted").length,
  };
}
