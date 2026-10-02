import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getTokenBalance } from "@/lib/data/tokens";
import { applicantHasLinkedIn, getApplicationForJob, getJobForApplicant, getLatestSucceededFits } from "@/lib/data/jobs";
import { ApplyCard } from "@/components/jobs/apply-card";
import { JobText } from "@/components/jobs/job-text";
import { CheckFitPanel } from "@/components/fit/check-fit-panel";
import { CompanyLogo } from "@/components/shared/misc";
import { JobStatusChip, TechnicalChip, TokenCostBadge } from "@/components/shared/chips";
import { WORK_MODE_LABEL } from "@/lib/copy";
import type { ApplyJob } from "@/components/applications/apply-dialog";

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const session = await requireRole("applicant");
  const { jobId } = await params;
  const job = getJobForApplicant(jobId, session.userId);
  if (!job) notFound();

  const [balance, application, fits, hasLinkedIn] = await Promise.all([
    getTokenBalance(session.userId),
    Promise.resolve(getApplicationForJob(session.userId, job.id)),
    Promise.resolve(getLatestSucceededFits(session.userId)),
    Promise.resolve(applicantHasLinkedIn(session.userId)),
  ]);

  const applyJob: ApplyJob = {
    id: job.id,
    title: job.title,
    companyName: job.company.name,
    tokenCost: job.tokenCost,
    isTechnical: job.isTechnical,
    status: job.status,
  };
  const applied = application ? { applicationId: application.id, status: application.status } : null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
      <article className="space-y-6">
        <header className="flex items-start gap-4">
          <CompanyLogo name={job.company.name} logoUrl={job.company.logoUrl} size={56} />
          <div className="min-w-0 space-y-2">
            <h1 className="text-h1">{job.title}</h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-copy">
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                {job.company.name}
                {job.company.verificationStatus === "verified" && (
                  <>
                    <BadgeCheck className="size-4 text-success" aria-hidden />
                    <span className="sr-only">Verified company</span>
                  </>
                )}
              </span>
              {job.location && (
                <>
                  <span aria-hidden>·</span>
                  <span>{job.location}</span>
                </>
              )}
              {job.workMode && (
                <>
                  <span aria-hidden>·</span>
                  <span>{WORK_MODE_LABEL[job.workMode]}</span>
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {job.status !== "open" && <JobStatusChip status={job.status} />}
              <TokenCostBadge cost={job.tokenCost} />
              {job.isTechnical && <TechnicalChip />}
            </div>
          </div>
        </header>

        <section className="space-y-3">
          <h2 className="text-h2">About the role</h2>
          <JobText text={job.description} />
        </section>
        <section className="space-y-3">
          <h2 className="text-h2">Requirements</h2>
          <JobText text={job.requirements} />
        </section>
      </article>

      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-card p-5 shadow-1">
          <CheckFitPanel
            job={applyJob}
            initial={fits.get(job.id) ?? null}
            balance={balance}
            applied={applied}
            hasLinkedInImport={hasLinkedIn}
          />
        </section>
        <ApplyCard job={applyJob} balance={balance} applied={applied} />
      </div>
    </div>
  );
}
