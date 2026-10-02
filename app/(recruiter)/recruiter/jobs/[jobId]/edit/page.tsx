import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/misc";
import { JobForm } from "@/components/recruiter/job-form";
import type { JobInput } from "@/components/recruiter/job-schema";
import { VerificationBanner } from "@/components/recruiter/verification-banner";
import { canPublish, getCompany } from "@/lib/data/companies";
import { getRecruiterJob } from "@/lib/data/recruiter-jobs";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return { title: `Edit job · ${jobId}` };
}

export default async function EditJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const session = await requireRole("recruiter");
  if (!session.companyId) notFound();
  const { jobId } = await params;
  const [company, job] = await Promise.all([getCompany(session.companyId), getRecruiterJob(session.companyId, jobId)]);
  if (!company || !job) notFound();

  const verified = canPublish(session.membershipStatus, company.verificationStatus);
  const defaults: JobInput = {
    title: job.title,
    location: job.location ?? "",
    workMode: job.workMode ?? "remote",
    description: job.description,
    requirements: job.requirements,
    isTechnical: job.isTechnical,
    tokenCost: job.tokenCost,
  };

  return (
    <div>
      <VerificationBanner status={verified ? "verified" : session.membershipStatus === "rejected" ? "rejected" : "pending"} />
      <p className="mb-2 text-small">
        <Link href="/recruiter/jobs" className="text-link">
          Jobs
        </Link>
      </p>
      <PageHeader title="Edit job" description={job.title} />
      <JobForm
        mode="edit"
        jobId={job.id}
        status={job.status}
        verified={verified}
        companyName={company.name}
        logoUrl={company.logoUrl}
        defaultValues={defaults}
        locked={job.applicationCount >= 1}
        unactedCount={job.unactedCount}
      />
    </div>
  );
}
