"use client";

import { usePathname, useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PipelineCounts, PipelineSort, PipelineStatusFilter } from "@/lib/data/pipeline";
import { cn } from "@/lib/utils";

const TABS: { id: PipelineStatusFilter; label: string; count: keyof PipelineCounts }[] = [
  { id: "active", label: "Active", count: "active" },
  { id: "shortlisted", label: "Shortlisted", count: "shortlisted" },
  { id: "rejected", label: "Rejected", count: "rejected" },
  { id: "withdrawn", label: "Withdrawn", count: "withdrawn" },
];

export function ApplicantFilters({
  status,
  sort,
  minConfidence,
  includeIncomplete,
  counts,
  isTechnical,
}: {
  status: PipelineStatusFilter;
  sort: PipelineSort;
  minConfidence: 50 | 70 | 85 | null;
  includeIncomplete: boolean;
  counts: PipelineCounts;
  isTechnical: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function push(next: {
    status: PipelineStatusFilter;
    sort: PipelineSort;
    minConfidence: 50 | 70 | 85 | null;
    includeIncomplete: boolean;
  }) {
    const params = new URLSearchParams();
    if (next.status !== "active") params.set("status", next.status);
    if (next.sort !== "rank") params.set("sort", next.sort);
    if (next.minConfidence) params.set("min", String(next.minConfidence));
    if (!next.includeIncomplete) params.set("incomplete", "0");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const current = { status, sort, minConfidence, includeIncomplete };

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Application status" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {TABS.map((tab) => {
          const selected = status === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "rounded-md px-3 py-1.5 text-small outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "bg-card text-foreground shadow-1" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => push({ ...current, status: tab.id })}
            >
              {tab.label} <span className="tabular-nums">({counts[tab.count]})</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1">
          <Label htmlFor="applicant-sort">Sort</Label>
          <Select value={sort} onValueChange={(value) => push({ ...current, sort: value as PipelineSort })}>
            <SelectTrigger id="applicant-sort" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="rank">Rank</SelectItem>
              <SelectItem value="confidence">Fit score</SelectItem>
              {isTechnical && <SelectItem value="github">GitHub score</SelectItem>}
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="min-fit">Min fit</Label>
          <Select
            value={minConfidence ? String(minConfidence) : "any"}
            onValueChange={(value) =>
              push({
                ...current,
                minConfidence: value === "50" || value === "70" || value === "85" ? (Number(value) as 50 | 70 | 85) : null,
              })
            }
          >
            <SelectTrigger id="min-fit" className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="50">50+</SelectItem>
              <SelectItem value="70">70+</SelectItem>
              <SelectItem value="85">85+</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Switch
            id="show-incomplete"
            checked={includeIncomplete}
            onCheckedChange={(checked) => push({ ...current, includeIncomplete: checked })}
          />
          <Label htmlFor="show-incomplete">Show incomplete</Label>
        </div>
      </div>
    </div>
  );
}
