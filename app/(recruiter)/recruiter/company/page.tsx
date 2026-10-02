import { BadgeCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getCompany } from "@/lib/data/companies";
import { CompanyLogo, PageHeader } from "@/components/shared/misc";
import { CompanyProfileForm } from "@/components/recruiter/company-profile-form";
import { VerificationBanner } from "@/components/recruiter/verification-banner";

export const metadata = { title: "Company" };

export default async function CompanyPage() {
  const session = await requireRole("recruiter");
  if (!session.companyId) notFound();
  const company = await getCompany(session.companyId);
  if (!company) notFound();
  const verified = company.verificationStatus === "verified";

  return (
    <>
      <VerificationBanner status={session.membershipStatus} />
      {verified && (
        <p className="mb-6 inline-flex items-center gap-1.5 rounded-md bg-success-subtle px-3 py-1.5 text-small text-success-fg">
          <BadgeCheck className="size-4" aria-hidden />
          Verified
        </p>
      )}
      <PageHeader title="Company" description="One recruiter per company in this version." />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex flex-col items-center rounded-xl border bg-card p-6 text-center shadow-1">
          <CompanyLogo name={company.name} logoUrl={company.logoUrl} size={72} />
          <h2 className="mt-3 text-h3">{company.name}</h2>
          {company.website && (
            <a href={company.website} className="mt-1 text-small text-link underline-offset-4 hover:underline" rel="noreferrer">
              {company.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-1">
          <h2 className="mb-4 text-h3">Profile</h2>
          <CompanyProfileForm name={company.name} website={company.website ?? ""} description={company.description ?? ""} />
        </div>
        <section className="rounded-xl border bg-card p-5 shadow-1 lg:col-span-2">
          <h2 className="text-h3">Verified domains</h2>
          <p className="mt-1 text-small text-copy">Read-only. Domains come from the work email used to claim the company.</p>
          {company.domains.length === 0 ? (
            <p className="mt-4 text-body text-copy">No domains yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {company.domains.map((domain) => (
                <li key={domain} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <span className="text-code">{domain}</span>
                  <span className={verified ? "text-small text-success-fg" : "text-small text-warning-fg"}>{verified ? "Verified" : "Pending"}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-small text-copy">One recruiter per company in this version.</p>
        </section>
      </div>
    </>
  );
}
