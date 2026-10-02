import type { EvaluationStatus } from "@/lib/types";

const ROWS = [
  { key: "richMedia" as const, label: "LinkedIn rich media" },
  { key: "profile" as const, label: "LinkedIn profile" },
  { key: "resume" as const, label: "Resume" },
];

function scoreText(score: number | null): string {
  if (score == null) return "—";
  return Number.isInteger(score) ? String(score) : score.toFixed(0);
}

export function FitScoreBreakdown({
  fitScore,
  fitStatus,
  jev,
  compact,
}: {
  fitScore: number | null;
  fitStatus: EvaluationStatus | null;
  jev: { richMedia: number | null; profile: number | null; resume: number | null };
  compact?: boolean;
}) {
  const pending = fitStatus === "pending" || fitStatus === "running";
  const failed = fitStatus === "failed";
  const hasSubScores = ROWS.some((row) => jev[row.key] != null);

  if (compact) {
    if (pending || failed || fitScore == null || !hasSubScores) return null;
    const parts = ROWS.map((row) => jev[row.key]).filter((v): v is number => v != null);
    if (parts.length === 0) return null;
    return (
      <p className="mt-1 text-small tabular-nums text-muted-foreground">
        Fit {scoreText(fitScore)} · Rich media {scoreText(jev.richMedia)} · Profile {scoreText(jev.profile)} · Resume{" "}
        {scoreText(jev.resume)}
      </p>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-4 shadow-1">
      <h2 className="text-h3">Fit scores</h2>
      {pending && <p className="mt-2 text-body text-muted-foreground">Fit evaluation in progress…</p>}
      {failed && !pending && <p className="mt-2 text-body text-muted-foreground">Fit score unavailable</p>}
      {!pending && !failed && (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {ROWS.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-body text-foreground">{row.label}</span>
              <span className="tabular-nums text-body text-foreground">{scoreText(jev[row.key])}</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-body font-medium text-foreground">Overall fit</span>
            <span className="tabular-nums text-body font-medium text-foreground">{scoreText(fitScore)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}
