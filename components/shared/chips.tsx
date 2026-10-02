import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, EvaluationStatus, JobStatus, TokenCost } from "@/lib/types";
import { BAND_LABEL, bandFor } from "@/lib/ranking/bands";
import { formatCredits } from "@/lib/copy";

const chipBase = "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-small whitespace-nowrap border";

const APPLICANT_LABEL: Record<ApplicationStatus, string> = {
  submitted: "Submitted",
  shortlisted: "Shortlisted",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};
const RECRUITER_LABEL: Record<ApplicationStatus, string> = {
  submitted: "New",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};
const STATUS_TONE: Record<ApplicationStatus, string> = {
  submitted: "bg-muted text-foreground border-border",
  shortlisted: "bg-success-subtle text-success-fg border-success/20",
  rejected: "bg-muted text-muted-foreground border-border",
  withdrawn: "bg-muted text-muted-foreground border-border",
};

export function StatusChip({ status, audience }: { status: ApplicationStatus; audience: "applicant" | "recruiter" }) {
  const label = (audience === "applicant" ? APPLICANT_LABEL : RECRUITER_LABEL)[status];
  return <span className={cn(chipBase, STATUS_TONE[status])}>{label}</span>;
}

const JOB_STATUS: Record<JobStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-muted text-foreground border-border" },
  open: { label: "Open", tone: "bg-success-subtle text-success-fg border-success/20" },
  closed: { label: "Closed", tone: "bg-muted text-muted-foreground border-border" },
  archived: { label: "Archived", tone: "bg-muted text-muted-foreground border-border" },
};

export function JobStatusChip({ status }: { status: JobStatus }) {
  const s = JOB_STATUS[status];
  return <span className={cn(chipBase, s.tone)}>{s.label}</span>;
}

export function TokenCostBadge({ cost, className }: { cost: TokenCost | number; className?: string }) {
  return (
    <span className={cn(chipBase, "border-token/15 bg-token-subtle font-mono text-token-fg", className)}>
      {formatCredits(cost)}
    </span>
  );
}

export function TechnicalChip() {
  return <span className={cn(chipBase, "border-border bg-card text-copy")}>Technical</span>;
}

const BAND_TONE = {
  strong: "bg-success text-white border-success",
  good: "bg-success-subtle text-success-fg border-success/40",
  moderate: "bg-warning-subtle text-warning-fg border-warning/30",
  limited: "bg-muted text-copy border-border",
} as const;

export function MatchScoreBadge({
  score,
  status,
  stale,
  provisional,
  size = "default",
}: {
  score: number | null;
  status?: EvaluationStatus;
  stale?: boolean;
  provisional?: boolean;
  size?: "default" | "lg";
}) {
  const pill = cn(
    "inline-flex items-center gap-1.5 rounded-full border font-medium tabular-nums whitespace-nowrap",
    size === "lg" ? "px-4 py-1.5 text-h3" : "px-2.5 py-0.5 text-small",
  );
  if (status === "pending" || status === "running") {
    return (
      <span className={cn(pill, "border-border bg-card text-muted-foreground")}>
        <Loader2 className="size-3 animate-spin" aria-hidden /> Checking…
      </span>
    );
  }
  if (score == null) return null;
  const band = bandFor(score);
  return (
    <span
      className={cn(pill, BAND_TONE[band], (stale || provisional) && "border-dashed")}
      title={stale ? "Your profile changed. Re-check." : undefined}
    >
      {Math.round(score)} · {BAND_LABEL[band]}
      {provisional && <span className="opacity-80">· Provisional</span>}
    </span>
  );
}
