import Link from "next/link";
import { format, parseISO } from "date-fns";
import { requireRole } from "@/lib/auth/session";
import { JobStatusChip, TechnicalChip, TokenCostBadge } from "@/components/shared/chips";
import { EmptyState, PageHeader } from "@/components/shared/misc";
import { JobActionsMenu } from "@/components/recruiter/job-actions-menu";
import { JobNotice } from "@/components/recruiter/job-notice";
import { VerificationBanner } from "@/components/recruiter/verification-banner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canPublish, getCompany } from "@/lib/data/companies";
import { getRecruiterJobsDashboard, type RecruiterJobListItem } from "@/lib/data/recruiter-jobs";

export const dynamic = "force-dynamic";

export const metadata = { title: "Jobs · NexusPulse" };

export default async function RecruiterJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const session = await requireRole("recruiter");
  const noticeParam = (await searchParams).notice;
  const notice = typeof noticeParam === "string" ? noticeParam : undefined;
  const company = session.companyId ? await getCompany(session.companyId) : null;
  const verified = canPublish(session.membershipStatus, company?.verificationStatus ?? null);
  const dashboard = session.companyId
    ? await getRecruiterJobsDashboard(session.companyId)
    : { jobs: [], metrics: { openJobs: 0, totalApplicants: 0, newApplicants: 0, shortlisted: 0 } };
  const bannerStatus = session.membershipStatus === "rejected" || company?.verificationStatus === "rejected"
    ? "rejected"
    : verified
      ? "verified"
      : "pending";

  return (
    <div>
      <JobNotice notice={notice} />
      <VerificationBanner status={bannerStatus} />
      <PageHeader
        title="Jobs"
        description={company ? `Roles at ${company.name}.` : "Post a role to start receiving applications."}
        actions={
          <Button asChild>
            <Link href="/recruiter/jobs/new">Post a job</Link>
          </Button>
        }
      />

      {dashboard.jobs.length === 0 ? (
        <EmptyState
          title="Post your first job"
          body="Draft a role now. You can publish it once your company is verified."
          action={
            <Button asChild>
              <Link href="/recruiter/jobs/new">Post a job</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Open jobs" value={dashboard.metrics.openJobs} />
            <Metric label="Total applicants" value={dashboard.metrics.totalApplicants} />
            <Metric label="New applicants" value={dashboard.metrics.newApplicants} />
            <Metric label="Shortlisted" value={dashboard.metrics.shortlisted} />
          </div>

          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-1 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applicants</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="whitespace-normal">
                      <JobTitle job={job} verified={verified} />
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {job.isTechnical && <TechnicalChip />}
                        <TokenCostBadge cost={job.tokenCost} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <JobStatusChip status={job.status} />
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums">{job.activeCount} active</span>
                      <span className="text-muted-foreground"> / {job.newCount} new</span>
                    </TableCell>
                    <TableCell className="text-copy">{publishedLabel(job.publishedAt)}</TableCell>
                    <TableCell>
                      <JobActionsMenu job={job} verified={verified} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {dashboard.jobs.map((job) => (
              <li key={job.id} className="rounded-xl border bg-card p-4 shadow-1">
                <div className="flex items-start justify-between gap-3">
                  <JobTitle job={job} verified={verified} />
                  <JobActionsMenu job={job} verified={verified} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <JobStatusChip status={job.status} />
                  {job.isTechnical && <TechnicalChip />}
                  <TokenCostBadge cost={job.tokenCost} />
                </div>
                <p className="mt-2 text-small text-copy">
                  <span className="tabular-nums">{job.activeCount} active</span>
                  <span> / {job.newCount} new</span>
                  <span> · {publishedLabel(job.publishedAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-1">
      <div className="text-small text-muted-foreground">{label}</div>
      <div className="mt-1 text-metric tabular-nums">{value}</div>
    </div>
  );
}

function JobTitle({ job, verified }: { job: RecruiterJobListItem; verified: boolean }) {
  const href = verified && job.status !== "draft" ? `/recruiter/jobs/${job.id}` : `/recruiter/jobs/${job.id}/edit`;
  return (
    <Link href={href} className="font-medium text-foreground underline-offset-2 hover:text-link hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50">
      {job.title}
    </Link>
  );
}

function publishedLabel(iso: string | null) {
  if (!iso) return "Not published";
  return format(parseISO(iso), "MMM d, yyyy");
}
