import "server-only";
import type { Job, JobStatus } from "@/lib/types";
import { db, delay } from "@/lib/mock/db";

export interface JobCounts {
  applicationCount: number;
  activeCount: number;
  newCount: number;
  shortlistedCount: number;
  unactedCount: number;
}

export interface RecruiterJobListItem extends Job, JobCounts {}

export interface RecruiterJobMetrics {
  openJobs: number;
  totalApplicants: number;
  newApplicants: number;
  shortlisted: number;
}

const STATUS_ORDER: Record<JobStatus, number> = { open: 0, draft: 1, closed: 2, archived: 3 };

function countsFor(jobId: string): JobCounts {
  const apps = db().applications.filter((a) => a.jobId === jobId);
  return {
    applicationCount: apps.length,
    activeCount: apps.filter((a) => a.status === "submitted" || a.status === "shortlisted").length,
    newCount: apps.filter((a) => a.status === "submitted").length,
    shortlistedCount: apps.filter((a) => a.status === "shortlisted").length,
    unactedCount: apps.filter((a) => a.status === "submitted").length,
  };
}

export async function getRecruiterJobsDashboard(companyId: string): Promise<{
  jobs: RecruiterJobListItem[];
  metrics: RecruiterJobMetrics;
}> {
  await delay();
  const store = db();
  const jobs = store.jobs
    .filter((job) => job.companyId === companyId)
    .map((job) => ({ ...job, ...countsFor(job.id) }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.updatedAt.localeCompare(a.updatedAt));
  const ids = new Set(jobs.map((job) => job.id));
  const apps = store.applications.filter((a) => ids.has(a.jobId));
  return {
    jobs,
    metrics: {
      openJobs: jobs.filter((job) => job.status === "open").length,
      totalApplicants: apps.length,
      newApplicants: apps.filter((a) => a.status === "submitted").length,
      shortlisted: apps.filter((a) => a.status === "shortlisted").length,
    },
  };
}

export async function getRecruiterJob(companyId: string, jobId: string): Promise<RecruiterJobListItem | null> {
  await delay();
  const job = db().jobs.find((item) => item.id === jobId && item.companyId === companyId);
  if (!job) return null;
  return { ...job, ...countsFor(job.id) };
}
