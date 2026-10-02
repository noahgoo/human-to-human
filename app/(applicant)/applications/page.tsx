import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/auth/session";
import { formatCredits } from "@/lib/copy";
import { getTokenBalance } from "@/lib/data/tokens";
import { listMyApplications } from "@/lib/data/applications";
import { StatusChip } from "@/components/shared/chips";
import { CompanyLogo, EmptyState, PageHeader } from "@/components/shared/misc";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "My applications" };

export default async function ApplicationsPage() {
  const session = await requireRole("applicant");
  const [applications, balance] = await Promise.all([
    listMyApplications(session.userId),
    getTokenBalance(session.userId),
  ]);

  return (
    <div>
      <PageHeader title="My applications" description="Track what you've sent and what happens next." />
      {applications.length === 0 ? (
        <EmptyState
          title={`You haven't applied yet. You have ${formatCredits(balance.balance)} this month.`}
          action={
            <Button asChild>
              <Link href="/jobs">Browse jobs</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-1">
          {applications.map((application) => (
            <li key={application.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <CompanyLogo name={application.companyName} logoUrl={application.companyLogoUrl} size={40} />
                <div className="min-w-0">
                  <Link href={`/applications/${application.id}`} className="text-h3 text-link hover:underline">
                    {application.jobTitle}
                  </Link>
                  <p className="text-small text-copy">{application.companyName}</p>
                  {application.isTechnical && (
                    <p className="mt-1 text-small text-muted-foreground">Repository submitted for review</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:justify-end">
                <StatusChip status={application.status} audience="applicant" />
                <time dateTime={application.submittedAt} className="text-small text-muted-foreground">
                  {format(new Date(application.submittedAt), "MMM d, yyyy")}
                </time>
                <span className="text-small text-token-fg">Spent {formatCredits(application.tokenCost)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
