import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { formatCredits, WORK_MODE_LABEL } from "@/lib/copy";
import { getMyApplication } from "@/lib/data/applications";
import type { ApplicationStatus } from "@/lib/types";
import { StatusChip } from "@/components/shared/chips";
import { CompanyLogo } from "@/components/shared/misc";
import { ApplicationTimeline } from "@/components/applications/application-timeline";
import { WithdrawDialog } from "@/components/applications/withdraw-dialog";

const STATUS_COPY: Record<ApplicationStatus, string> = {
  submitted: "The recruiter will review your application.",
  shortlisted: "Good news: you've been shortlisted. The company will contact you by email.",
  rejected: "The company decided not to move forward.",
  withdrawn: "You withdrew this application.",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}): Promise<Metadata> {
  const { applicationId } = await params;
  const session = await requireRole("applicant");
  const application = await getMyApplication(session.userId, applicationId);
  return { title: application ? `${application.jobTitle} · NexusPulse` : "Application · NexusPulse" };
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const session = await requireRole("applicant");
  const application = await getMyApplication(session.userId, applicationId);
  if (!application) notFound();
  const canWithdraw = application.status === "submitted" || application.status === "shortlisted";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <Link href="/applications" className="text-small text-link hover:underline">
        Back to My applications
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <CompanyLogo name={application.companyName} logoUrl={application.companyLogoUrl} size={48} />
          <div className="min-w-0">
            <h1 className="text-h1">{application.jobTitle}</h1>
            <p className="mt-1 text-body text-copy">
              {application.companyName}
              {application.location ? ` · ${application.location}` : ""}
              {application.workMode ? ` · ${WORK_MODE_LABEL[application.workMode]}` : ""}
            </p>
          </div>
        </div>
        <StatusChip status={application.status} audience="applicant" />
      </header>

      <p className="text-body text-foreground">{STATUS_COPY[application.status]}</p>

      <section>
        <h2 className="mb-4 text-h3">Timeline</h2>
        <ApplicationTimeline events={application.events} />
      </section>

      <p className="text-body text-foreground">Spent {formatCredits(application.tokenCost)}</p>

      {application.isTechnical && (
        <div>
          <p className="text-small text-copy">Repository submitted for review</p>
          {application.githubRepoUrl && (
            <p className="mt-1 font-mono text-code break-all text-foreground">{application.githubRepoUrl}</p>
          )}
        </div>
      )}

      {canWithdraw && (
        <WithdrawDialog applicationId={application.id} jobTitle={application.jobTitle} credits={application.tokenCost} />
      )}
    </div>
  );
}
