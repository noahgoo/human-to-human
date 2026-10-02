import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Coins, Send } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getTokenBalance } from "@/lib/data/tokens";
import {
  applicantHasLinkedIn,
  getLatestSucceededFits,
  listApplicantApplications,
  listOpenJobs,
} from "@/lib/data/jobs";
import { JobCard } from "@/components/jobs/job-card";
import { JobFilters } from "@/components/jobs/job-filters";
import { StatusChip } from "@/components/shared/chips";
import { EmptyState, PageHeader } from "@/components/shared/misc";
import { Button } from "@/components/ui/button";

function daysUntilReset(iso: string) {
  const target = new Date(iso);
  const now = new Date();
  const ms =
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()) -
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round(ms / 86_400_000));
}

function parseMaxCost(value: string | undefined): 1 | 2 | 3 | undefined {
  if (value === "1" || value === "2" || value === "3") return Number(value) as 1 | 2 | 3;
  return undefined;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; technical?: string; maxCost?: string }>;
}) {
  const session = await requireRole("applicant");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const technical = params.technical === "1";
  const maxCost = parseMaxCost(params.maxCost);
  const filtersActive = Boolean(q || technical || maxCost);

  const [jobs, balance, applications, fits, hasLinkedIn] = await Promise.all([
    Promise.resolve(
      listOpenJobs({
        q: q || undefined,
        technical: technical || undefined,
        maxCost,
      }),
    ),
    getTokenBalance(session.userId),
    Promise.resolve(listApplicantApplications(session.userId)),
    Promise.resolve(getLatestSucceededFits(session.userId)),
    Promise.resolve(applicantHasLinkedIn(session.userId)),
  ]);

  const appliedByJob = new Map(applications.map((item) => [item.jobId, item]));
  const active = applications.filter((item) => item.status === "submitted" || item.status === "shortlisted");
  const recent = applications.slice(0, 3);
  const days = daysUntilReset(balance.resetsAt);
  const activeCompanies = [...new Set(active.map((item) => item.companyName))].slice(0, 2);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Find your next role"
        description="Open roles at verified companies. Check your fit for free, then apply with credits."
      />

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 shadow-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <h2 className="text-small tracking-wide uppercase">Available credits</h2>
            <Coins className="size-5 text-token" aria-hidden />
          </div>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-metric tabular-nums">{balance.balance}</span>
            <span className="text-body text-muted-foreground">of {balance.total}</span>
          </p>
          <p className="mt-3 border-t border-border pt-2.5 text-small text-muted-foreground">
            Resets in {days} {days === 1 ? "day" : "days"}
          </p>
        </div>
        <Link
          href="/applications"
          className="rounded-xl border border-border bg-card p-5 shadow-1 transition-shadow hover:border-border-strong hover:shadow-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <h2 className="text-small tracking-wide uppercase">Active applications</h2>
            <Send className="size-5" aria-hidden />
          </div>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-metric tabular-nums">{active.length}</span>
            <span className="text-body text-muted-foreground">submitted or shortlisted</span>
          </p>
          <p className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2.5 text-small">
            <span className="truncate text-muted-foreground">
              {activeCompanies.length ? activeCompanies.join(", ") : "None yet"}
            </span>
            <span className="shrink-0 font-medium text-link">View applications</span>
          </p>
        </Link>
      </section>

      <JobFilters q={q} technical={technical} maxCost={params.maxCost === "1" || params.maxCost === "2" || params.maxCost === "3" ? params.maxCost : ""} />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4" aria-label="Open roles">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="text-h2">Open roles</h2>
            <p className="text-small text-muted-foreground tabular-nums">{jobs.length} roles</p>
          </div>
          {jobs.length === 0 ? (
            <EmptyState
              title={filtersActive ? (q ? `No jobs match '${q}'.` : "No jobs match these filters.") : "No open jobs right now."}
              body={filtersActive ? undefined : "New roles are posted weekly."}
              action={
                filtersActive ? (
                  <Button variant="secondary" asChild>
                    <Link href="/jobs">Clear filters</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            jobs.map((job) => {
              const application = appliedByJob.get(job.id);
              return (
                <JobCard
                  key={job.id}
                  job={job}
                  fit={fits.get(job.id) ?? null}
                  applied={
                    application
                      ? { applicationId: application.id, status: application.status }
                      : null
                  }
                  balance={balance}
                  hasLinkedInImport={hasLinkedIn}
                />
              );
            })
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-5 shadow-1">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-h3">Recent activity</h2>
              <Link href="/applications" className="text-small font-medium text-link hover:underline">
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className="text-body text-muted-foreground">You haven&apos;t applied yet.</p>
            ) : (
              <ul className="space-y-3">
                {recent.map((item) => (
                  <li key={item.id} className="rounded-lg border border-border bg-muted/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-small font-semibold text-foreground">{item.companyName}</p>
                      <StatusChip status={item.status} audience="applicant" />
                    </div>
                    <Link
                      href={`/applications/${item.id}`}
                      className="mt-1 block text-body text-copy hover:text-link focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {item.jobTitle}
                    </Link>
                    <p className="mt-1 text-small text-muted-foreground">
                      Applied {formatDistanceToNow(new Date(item.submittedAt), { addSuffix: true })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-1">
            <h2 className="text-h3">Why application credits?</h2>
            <p className="mt-2 text-body text-copy">
              10 free credits every month. Jobs cost 1–3 credits. Unused credits don&apos;t roll over.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
