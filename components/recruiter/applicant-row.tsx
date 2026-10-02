"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { MatchScoreBadge, StatusChip } from "@/components/shared/chips";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/copy";
import type { RankedApplicant } from "@/lib/data/pipeline";
import { FitScoreBreakdown } from "./fit-score-breakdown";
import { RepoScoreCard } from "./repo-score-card";
import { StatusActions, useApplicationStatus } from "./status-actions";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function scoreCaption(row: RankedApplicant) {
  if (row.rank.tier === 2) return row.fit.status === "failed" ? "Fit score unavailable" : "Fit score pending";
  if (row.rank.tier !== 1) return null;
  if (row.repo?.status === "failed") return "GitHub review unavailable: listed under Incomplete";
  return "Provisional · GitHub review in progress";
}

export function ApplicantRow({ row, showRank, href }: { row: RankedApplicant; showRank: boolean; href: string }) {
  const { status, pending, change } = useApplicationStatus(row.application.status, row.application.jobId, row.application.id);
  const caption = scoreCaption(row);
  const applied = formatDistanceToNow(new Date(row.application.submittedAt), { addSuffix: true });

  return (
    <article className="rounded-xl border bg-card p-4 shadow-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {showRank && (
          <p className="w-10 shrink-0 text-h3 tabular-nums text-muted-foreground">
            {row.rank.position != null ? `#${row.rank.position}` : ""}
          </p>
        )}
        <Avatar size="lg">
          {row.applicant.avatarUrl && <AvatarImage src={row.applicant.avatarUrl} alt="" />}
          <AvatarFallback className="text-small font-medium text-foreground">{initials(row.applicant.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-h3">
              <Link
                href={href}
                className="rounded-sm text-foreground outline-none hover:text-link focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {row.applicant.name}
              </Link>
            </h3>
            <StatusChip status={status} audience="recruiter" />
          </div>
          {row.applicant.headline && <p className="mt-0.5 text-body text-copy">{row.applicant.headline}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {row.rank.tier === 2 ? null : (
              <MatchScoreBadge score={row.fit.score} status={row.fit.status ?? undefined} provisional={row.rank.tier === 1} />
            )}
            <span className="text-small text-muted-foreground">Applied {applied}</span>
            <span className="text-small tabular-nums text-muted-foreground">Spent {formatCredits(row.application.tokenCost)}</span>
          </div>
          {caption && (
            <p className={row.repo?.status === "failed" || row.rank.tier === 2 ? "mt-1 text-small text-warning-fg" : "mt-1 text-small text-muted-foreground"}>
              {caption}
            </p>
          )}
          <FitScoreBreakdown
            fitScore={row.fit.score}
            fitStatus={row.fit.status}
            jev={row.fit.jev}
            compact
          />
          {row.repo && (
            <div className="mt-3">
              <RepoScoreCard repo={row.repo} variant="compact" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
          <StatusActions
            jobId={row.application.jobId}
            applicationId={row.application.id}
            status={status}
            surface="list"
            pending={pending}
            onChange={change}
          />
          <Button asChild variant="outline" size="sm">
            <Link href={href}>View application</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
