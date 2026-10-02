import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/misc";
import { JobForm } from "@/components/recruiter/job-form";
import { VerificationBanner } from "@/components/recruiter/verification-banner";
import type { JobInput } from "@/components/recruiter/job-schema";
import { canPublish, getCompany } from "@/lib/data/companies";

export const dynamic = "force-dynamic";

export const metadata = { title: "Post a job · NexusPulse" };

const DEFAULTS: JobInput = {
  title: "",
  location: "",
  workMode: "remote",
  description: "",
  requirements: "",
  isTechnical: false,
  tokenCost: 2,
};

export default async function NewJobPage() {
  const session = await requireRole("recruiter");
  if (!session.companyId) notFound();
  const company = await getCompany(session.companyId);
  if (!company) notFound();
  const verified = canPublish(session.membershipStatus, company.verificationStatus);

  return (
    <div>
      <VerificationBanner status={verified ? "verified" : company.verificationStatus} />
      <p className="mb-2 text-small">
        <Link href="/recruiter/jobs" className="text-link">
          Jobs
        </Link>
      </p>
      <PageHeader
        title="Post a job"
        description="Describe the role, turn on technical screening if you want a public GitHub repo, and set how many credits an application costs."
      />
      <JobForm
        mode="create"
        verified={verified}
        companyName={company.name}
        logoUrl={company.logoUrl}
        defaultValues={DEFAULTS}
        locked={false}
      />
    </div>
  );
}
