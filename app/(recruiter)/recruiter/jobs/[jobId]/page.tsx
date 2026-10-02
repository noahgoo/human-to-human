import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { applicantsQueryString, loadApplicantsPage, parseApplicantsQuery, type PipelineSort } from "@/lib/data/pipeline";
import { JobStatusChip, TechnicalChip, TokenCostBadge } from "@/components/shared/chips";
import { EmptyState } from "@/components/shared/misc";
import { Button } from "@/components/ui/button";
import { ApplicantFilters } from "@/components/recruiter/applicant-filters";
import { PipelineApplicantList } from "@/components/recruiter/pipeline-applicant-list";
import { PipelineFairnessNotice } from "@/components/recruiter/pipeline-fairness-notice";
import { PipelineJobSwitcher } from "@/components/recruiter/pipeline-job-switcher";
import JobNotFound from "./not-found";

function listLabel(isTechnical: boolean, sort: PipelineSort) {
  if (sort === "rank") return isTechnical ? "Applicants ranked by fit and GitHub" : "Applicants ranked by fit score";
  const by: Record<Exclude<PipelineSort, "rank">, string> = {
    confidence: "fit score",
    github: "GitHub score",
    newest: "newest first",
    oldest: "oldest first",
  };
  return `Applicants sorted by ${by[sort]}`;
}

export default async function RankedApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("recruiter");
  if (session.membershipStatus !== "verified" || !session.companyId) redirect("/recruiter/pending");

  const { jobId } = await params;
  const query = parseApplicantsQuery(await searchParams);
  const data = await loadApplicantsPage(jobId, session.companyId, query);
  if (!data) return <JobNotFound />;
  const sort: PipelineSort = query.sort === "github" && !data.job.isTechnical ? "rank" : query.sort;
  const total = data.counts.new + data.counts.shortlisted + data.counts.rejected + data.counts.withdrawn;
  const caption = data.job.isTechnical ? "Ranked by 70% fit + 30% GitHub" : "Ranked by fit score";
  const qs = applicantsQueryString({ ...query, sort });
  const hrefFor = (applicationId: string) => {
    const path = `/recruiter/jobs/${data.job.id}/applicants/${applicationId}`;
    return qs ? `${path}?${qs}` : path;
  };
  const moreLimit = query.limit + 20;
  const moreQs = applicantsQueryString({ ...query, sort }, moreLimit);
  const moreHref = moreQs ? `/recruiter/jobs/${data.job.id}?${moreQs}` : `/recruiter/jobs/${data.job.id}`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1">{data.job.title}</h1>
            <JobStatusChip status={data.job.status} />
            <TokenCostBadge cost={data.job.tokenCost} />
            {data.job.isTechnical && <TechnicalChip />}
          </div>
          {session.companyName && <p className="mt-1 text-body text-copy">{session.companyName}</p>}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <PipelineJobSwitcher jobs={data.companyJobs} jobId={data.job.id} />
          <Button asChild variant="outline">
            <Link href={`/recruiter/jobs/${data.job.id}/edit`}>Edit</Link>
          </Button>
        </div>
      </header>

      {data.job.status !== "draft" && (
        <dl className={`grid grid-cols-2 gap-3 ${data.job.isTechnical ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          <Metric label="Active" value={data.counts.active} />
          <Metric label="New" value={data.counts.new} />
          <Metric label="Shortlisted" value={data.counts.shortlisted} />
          {data.job.isTechnical && <Metric label="Incomplete" value={data.counts.incomplete} />}
        </dl>
      )}

      {data.job.status === "draft" ? (
        <EmptyState
          title="Publish this job to receive applicants."
          action={
            <Button asChild>
              <Link href={`/recruiter/jobs/${data.job.id}/edit`}>Edit job</Link>
            </Button>
          }
        />
      ) : (
        <>
          <PipelineFairnessNotice />
          <div className="flex flex-col gap-3">
            <ApplicantFilters
              status={query.status}
              sort={sort}
              minConfidence={query.minConfidence}
              includeIncomplete={query.includeIncomplete}
              counts={data.counts}
              isTechnical={data.job.isTechnical}
            />
            <p className="text-small text-muted-foreground">{caption}</p>
          </div>
          {total === 0 ? (
            <EmptyState title="No applicants yet. Share the job link." />
          ) : data.rows.length === 0 ? (
            <EmptyState
              title="No applicants match these filters."
              action={
                <Button asChild variant="outline">
                  <Link href={`/recruiter/jobs/${data.job.id}`}>Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <>
              <PipelineApplicantList
                rows={data.rows}
                grouped={sort === "rank"}
                tierCounts={data.tierCounts}
                showRank={sort === "rank"}
                listLabel={listLabel(data.job.isTechnical, sort)}
                hrefFor={hrefFor}
              />
              {data.matchCount > data.rows.length && (
                <div className="flex justify-center">
                  <Button asChild variant="outline">
                    <Link href={moreHref}>Load more</Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-1">
      <dt className="text-small text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-metric tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
