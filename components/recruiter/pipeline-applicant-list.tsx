import type { ReactNode } from "react";
import type { RankedApplicant, RankTier } from "@/lib/data/pipeline";
import { ApplicantRow } from "./applicant-row";

const TIER_LABEL: Record<RankTier, string> = {
  0: "Complete",
  1: "Incomplete: GitHub review pending or unavailable",
  2: "Not scored yet",
};

export function PipelineApplicantList({
  rows,
  grouped,
  tierCounts,
  showRank,
  listLabel,
  hrefFor,
}: {
  rows: RankedApplicant[];
  grouped: boolean;
  tierCounts: Record<RankTier, number>;
  showRank: boolean;
  listLabel: string;
  hrefFor: (applicationId: string) => string;
}) {
  const items: ReactNode[] = [];
  let lastTier: RankTier | null = null;
  for (const row of rows) {
    if (grouped && row.rank.tier !== lastTier) {
      lastTier = row.rank.tier;
      items.push(
        <li key={`tier-${lastTier}`} className="list-none pt-2 first:pt-0">
          <h2 className="text-small text-muted-foreground">
            {TIER_LABEL[lastTier]} <span className="tabular-nums">({tierCounts[lastTier]})</span>
          </h2>
        </li>,
      );
    }
    items.push(
      <li key={row.application.id}>
        <ApplicantRow row={row} showRank={showRank} href={hrefFor(row.application.id)} />
      </li>,
    );
  }

  return (
    <ol aria-label={listLabel} className="flex list-none flex-col gap-3">
      {items}
    </ol>
  );
}
