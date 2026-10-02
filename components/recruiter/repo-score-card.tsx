import { Loader2 } from "lucide-react";
import { REPO_CATEGORY_LABEL } from "@/lib/copy";
import type { EvaluationStatus, RepoCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORIES: RepoCategory[] = ["security", "organization", "performance", "testing"];

export interface RepoScoreCardModel {
  status: EvaluationStatus;
  scores: Record<RepoCategory, number> | null;
  overall: number | null;
  rationale: Partial<Record<RepoCategory, string>>;
  repoFullName: string;
  commitSha: string | null;
  flags: string[];
  failureCode: string | null;
}

function scoreLabel(score: number) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function RepoScoreCard({ repo, variant }: { repo: RepoScoreCardModel; variant: "compact" | "full" }) {
  const pending = repo.status === "pending" || repo.status === "running";
  const failed = repo.status === "failed";

  return (
    <div className={cn(variant === "full" && "rounded-xl border bg-card p-4 shadow-1")}>
      {variant === "full" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="font-mono text-code text-foreground">{repo.repoFullName}</p>
          {repo.commitSha && (
            <span className="font-mono text-code text-muted-foreground">{repo.commitSha.slice(0, 7)}</span>
          )}
          <span className="text-small text-muted-foreground">Ownership not verified</span>
          {repo.flags.includes("fork") && (
            <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-small text-foreground">
              Fork
            </span>
          )}
        </div>
      )}

      {pending && (
        <p className="flex items-center gap-2 text-body text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Reviewing repository…
        </p>
      )}

      {failed && (
        <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-body text-warning-fg">
          Review unavailable: listed under Incomplete
        </p>
      )}

      {!pending && !failed && repo.scores && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CATEGORIES.map((category) => (
              <div key={category} className="rounded-md bg-muted px-2 py-1.5">
                <div className="text-small text-muted-foreground">{REPO_CATEGORY_LABEL[category]}</div>
                <div className="tabular-nums text-foreground">
                  {scoreLabel(repo.scores![category])} / 10
                </div>
              </div>
            ))}
          </div>
          {repo.overall != null && (
            <p className="mt-2 text-small text-copy">
              Average <span className="tabular-nums text-foreground">{repo.overall.toFixed(2)} / 10</span>
            </p>
          )}
          {variant === "full" && (
            <ul className="mt-4 space-y-3">
              {CATEGORIES.map((category) => (
                <li key={category}>
                  <p className="text-small text-foreground">{REPO_CATEGORY_LABEL[category]}</p>
                  <p className="mt-0.5 text-body text-copy">{repo.rationale[category] ?? "No written rationale."}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
