"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { CheckFitPanel } from "@/components/fit/check-fit-panel";
import { CompanyLogo } from "@/components/shared/misc";
import { MatchScoreBadge, StatusChip, TechnicalChip, TokenCostBadge } from "@/components/shared/chips";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { WORK_MODE_LABEL } from "@/lib/copy";
import type { ApplicationStatus, FitEvaluation, JobWithCompany, TokenBalance } from "@/lib/types";
import type { ApplyJob } from "@/components/applications/apply-dialog";

function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return narrow;
}

export function JobCard({
  job,
  fit,
  applied,
  balance,
  hasLinkedInImport,
}: {
  job: JobWithCompany;
  fit: FitEvaluation | null;
  applied: { applicationId: string; status: ApplicationStatus } | null;
  balance: TokenBalance;
  hasLinkedInImport: boolean;
}) {
  const [open, setOpen] = useState(false);
  const narrow = useIsNarrow();
  const published = job.publishedAt ?? job.createdAt;
  const applyJob: ApplyJob = {
    id: job.id,
    title: job.title,
    companyName: job.company.name,
    tokenCost: job.tokenCost,
    isTechnical: job.isTechnical,
    status: job.status,
  };

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-1 transition-shadow hover:border-border-strong hover:shadow-2 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <CompanyLogo name={job.company.name} logoUrl={job.company.logoUrl} />
          <div className="min-w-0">
            <h3 className="text-h3">
              <Link
                href={`/jobs/${job.id}`}
                className="rounded-sm hover:text-link focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {job.title}
              </Link>
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-copy">
              <span className="font-semibold text-foreground">{job.company.name}</span>
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
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          {fit?.status === "succeeded" && fit.confidenceScore != null && (
            <MatchScoreBadge score={fit.confidenceScore} status={fit.status} />
          )}
          <div className="flex flex-wrap gap-2">
            <TokenCostBadge cost={job.tokenCost} />
            {job.isTechnical && <TechnicalChip />}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-muted-foreground">
          {formatDistanceToNow(new Date(published), { addSuffix: true })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Check fit
          </Button>
          {applied ? (
            <>
              <StatusChip status={applied.status} audience="applicant" />
              <Button variant="link" size="sm" asChild>
                <Link href={`/applications/${applied.applicationId}`}>View application</Link>
              </Button>
            </>
          ) : (
            <Button size="sm" asChild>
              <Link href={`/jobs/${job.id}`}>View & apply</Link>
            </Button>
          )}
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={narrow ? "bottom" : "right"}
          className="w-full overflow-y-auto sm:max-w-[440px] data-[side=bottom]:max-h-[85vh]"
        >
          <SheetHeader>
            <SheetTitle>Check fit</SheetTitle>
            <SheetDescription>
              {job.title} · {job.company.name}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {open && (
              <CheckFitPanel
                job={applyJob}
                initial={fit}
                balance={balance}
                applied={applied}
                hasLinkedInImport={hasLinkedInImport}
                showHeading={false}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </article>
  );
}
