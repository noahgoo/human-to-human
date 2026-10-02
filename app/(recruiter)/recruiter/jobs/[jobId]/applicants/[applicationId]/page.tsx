import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Check, Minus, X } from "lucide-react";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { FAIRNESS_NOTICE } from "@/lib/copy";
import { applicantsQueryString, loadApplicantDetail, loadRecruiterJob, parseApplicantsQuery } from "@/lib/data/pipeline";
import { ApplicantDecisionBar } from "@/components/recruiter/applicant-decision-bar";
import { ApplicantDetailLayout } from "@/components/recruiter/applicant-detail-layout";
import { FitScoreBreakdown } from "@/components/recruiter/fit-score-breakdown";
import { RankBreakdown } from "@/components/recruiter/rank-breakdown";
import { RepoScoreCard } from "@/components/recruiter/repo-score-card";
import { ResumeViewer } from "@/components/recruiter/resume-viewer";
import { Button } from "@/components/ui/button";
import type { ApplicationEvent, FitRequirement } from "@/lib/types";
import { cn } from "@/lib/utils";
import JobNotFound from "../../not-found";
import ApplicationNotFound from "./not-found";

const MET = {
  yes: { icon: Check, label: "Met", className: "text-success" },
  partial: { icon: Minus, label: "Partly met", className: "text-warning-fg" },
  no: { icon: X, label: "Not met", className: "text-muted-foreground" },
} as const;

function eventLabel(event: ApplicationEvent) {
  if (event.toStatus === "submitted" && event.fromStatus == null) return "Submitted";
  if (event.toStatus === "submitted") return "Moved back to New";
  if (event.toStatus === "shortlisted" && event.fromStatus === "rejected") return "Reconsidered";
  if (event.toStatus === "shortlisted") return "Shortlisted";
  if (event.toStatus === "rejected") return "Rejected";
  return "Withdrawn";
}

export default async function ApplicantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string; applicationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("recruiter");
  if (session.membershipStatus !== "verified" || !session.companyId) redirect("/recruiter/pending");

  const { jobId, applicationId } = await params;
  const query = parseApplicantsQuery(await searchParams);
  const job = await loadRecruiterJob(jobId, session.companyId);
  if (!job) return <JobNotFound />;
  const detail = await loadApplicantDetail(jobId, session.companyId, applicationId, query);
  if (!detail) return <ApplicationNotFound />;
  const sort = query.sort === "github" && !detail.job.isTechnical ? "rank" : query.sort;
  const qs = applicantsQueryString({ ...query, sort });
  const listHref = qs ? `/recruiter/jobs/${detail.job.id}?${qs}` : `/recruiter/jobs/${detail.job.id}`;
  const appHref = (id: string) => {
    const path = `/recruiter/jobs/${detail.job.id}/applicants/${id}`;
    return qs ? `${path}?${qs}` : path;
  };
  const { row } = detail;

  const overview = (
    <div className="flex flex-col gap-4">
      <ApplicantDecisionBar
        jobId={detail.job.id}
        applicationId={row.application.id}
        name={row.applicant.name}
        headline={row.applicant.headline}
        initialStatus={row.application.status}
      />
      <RankBreakdown
        isTechnical={detail.job.isTechnical}
        tier={row.rank.tier}
        score={row.rank.score}
        fitScore={row.fit.score}
        fitStatus={row.fit.status}
        githubOverall={row.repo?.status === "succeeded" ? row.repo.overall : null}
        repoStatus={row.repo?.status ?? null}
        position={row.rank.position}
      />
      <FitScoreBreakdown
        fitScore={row.fit.score}
        fitStatus={row.fit.status}
        jev={row.fit.jev}
      />
      <p className="text-small text-copy">{FAIRNESS_NOTICE}</p>
      <FitSection explanation={row.fit.explanation} requirements={row.fit.requirements} pending={row.rank.tier === 2} />
      {detail.job.isTechnical && row.repo && <RepoScoreCard repo={row.repo} variant="full" revealOnClick />}
      <Timeline events={row.application.events} />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link href={listHref}>
            <ArrowLeft />
            Back to list
          </Link>
        </Button>
        <div className="flex gap-2">
          {detail.prevId ? (
            <Button asChild variant="outline" size="sm">
              <Link href={appHref(detail.prevId)} aria-label="Previous applicant">
                Previous
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              Previous
            </Button>
          )}
          {detail.nextId ? (
            <Button asChild variant="outline" size="sm">
              <Link href={appHref(detail.nextId)} aria-label="Next applicant">
                Next
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              Next
            </Button>
          )}
        </div>
      </div>
      <ApplicantDetailLayout overview={overview} resume={<ResumeViewer {...detail.resume} />} />
    </div>
  );
}

function FitSection({
  explanation,
  requirements,
  pending,
}: {
  explanation: string | null;
  requirements: FitRequirement[];
  pending: boolean;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-1">
      <h2 className="text-h3">Fit</h2>
      {pending && !explanation ? (
        <p className="mt-2 text-body text-muted-foreground">Fit score pending</p>
      ) : (
        explanation && <p className="mt-2 text-body text-copy">{explanation}</p>
      )}
      {requirements.length > 0 && (
        <ul className="mt-3 space-y-2">
          {requirements.map((item, index) => {
            const meta = MET[item.met];
            const Icon = meta.icon;
            return (
              <li key={`${item.requirement}-${index}`} className="flex gap-2">
                <Icon className={cn("mt-0.5 size-4 shrink-0", meta.className)} aria-label={meta.label} />
                <div>
                  <p className="text-body text-foreground">{item.requirement}</p>
                  {item.evidence && <p className="text-small text-muted-foreground">{item.evidence}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Timeline({ events }: { events: ApplicationEvent[] }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-1">
      <h2 className="text-h3">Status history</h2>
      <ol className="mt-3 space-y-3 border-l border-border pl-4">
        {events.map((event, index) => (
          <li key={`${event.at}-${index}`} className="relative">
            <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-border-strong" aria-hidden />
            <p className="text-body text-foreground">{eventLabel(event)}</p>
            <p className="text-small text-muted-foreground">
              {format(new Date(event.at), "MMM d, yyyy 'at' h:mm a")}
              {event.actorName ? ` · ${event.actorName}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
