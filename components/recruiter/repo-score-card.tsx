import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { REPO_CATEGORY_LABEL } from "@/lib/copy";
import { repoCategoryDisplayScore, repoOverallDisplayScore } from "@/lib/data/scoring";
import type { EvaluationStatus, RepoCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORIES: RepoCategory[] = ["dataArchitecture", "performance", "deployment", "codeQuality", "teamTopology"];

export interface RepoScoreCardModel {
  status: EvaluationStatus;
  scores: Record<RepoCategory, number> | null;
  overall: number | null;
  rationale: Partial<Record<RepoCategory, string>>;
  gaps?: string | null;
  repoFullName: string;
  repoUrl?: string | null;
  commitSha: string | null;
  flags: string[];
  failureCode: string | null;
}

function scoreLabel(score: number) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function RepoScoreCard({
  repo,
  variant,
  revealOnClick = false,
}: {
  repo: RepoScoreCardModel;
  variant: "compact" | "full";
  revealOnClick?: boolean;
}) {
  const pending = repo.status === "pending" || repo.status === "running";
  const failed = repo.status === "failed";

  return (
    <div className={cn(variant === "full" && "rounded-xl border bg-card p-4 shadow-1")}>
      {variant === "compact" && repo.repoUrl && (
        <p className="mb-2 font-mono text-code text-foreground">
          <Link href={repo.repoUrl} className="text-link hover:underline" target="_blank" rel="noopener noreferrer">
            {repo.repoFullName}
          </Link>
        </p>
      )}

      {variant === "full" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {repo.repoUrl ? (
            <Link
              href={repo.repoUrl}
              className="font-mono text-code text-link hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {repo.repoFullName}
            </Link>
          ) : (
            <p className="font-mono text-code text-foreground">{repo.repoFullName}</p>
          )}
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
          <p className="mb-2 text-small font-medium text-foreground">GitHub repo</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CATEGORIES.map((category) => (
              <ScoreCell
                key={category}
                category={category}
                score={repoCategoryDisplayScore(repo.scores![category])}
                comment={repo.rationale[category]}
                paragraph={repo.gaps}
                clickable={revealOnClick}
              />
            ))}
          </div>
          {repo.overall != null && (
            <p className="mt-2 text-small text-copy">
              Average{" "}
              <span className="tabular-nums text-foreground">
                ({scoreLabel(repoOverallDisplayScore(repo.overall))}/100)
              </span>
            </p>
          )}
          {repo.gaps && !revealOnClick && <p className="mt-3 text-body text-copy">{repo.gaps}</p>}
          {variant === "full" && !revealOnClick && (
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

function ScoreCell({
  category,
  score,
  comment,
  paragraph,
  clickable,
}: {
  category: RepoCategory;
  score: number;
  comment?: string;
  paragraph?: string | null;
  clickable: boolean;
}) {
  const label = REPO_CATEGORY_LABEL[category];
  const note = comment?.trim();
  const gaps = paragraph?.trim();
  const body = (
    <div className="text-small text-foreground">
      {label}{" "}
      <span className="tabular-nums text-muted-foreground">({scoreLabel(score)}/100)</span>
    </div>
  );
  if (!clickable) {
    return <div className="rounded-md bg-muted px-2 py-1.5">{body}</div>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-md bg-muted px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`${label} review`}
        >
          {body}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="text-small font-medium text-foreground">{label}</p>
        {gaps && <p className="text-body text-copy">{gaps}</p>}
        {note && note !== gaps && <p className="text-body text-copy">{note}</p>}
        {!gaps && !note && <p className="text-body text-muted-foreground">No written review.</p>}
      </PopoverContent>
    </Popover>
  );
}
