import type { EvaluationStatus } from "@/lib/types";

function formatFit(score: number) {
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
}

export function RankBreakdown({
  isTechnical,
  tier,
  score,
  fitScore,
  fitStatus,
  githubOverall,
  repoStatus,
  position,
}: {
  isTechnical: boolean;
  tier: 0 | 1 | 2;
  score: number | null;
  fitScore: number | null;
  fitStatus: EvaluationStatus | null;
  githubOverall: number | null;
  repoStatus: EvaluationStatus | null;
  position: number | null;
}) {
  let body = "Fit score pending";
  if (tier === 2) {
    body = fitStatus === "failed" ? "Fit score unavailable" : "Fit score pending";
  } else if (tier === 1) {
    body =
      repoStatus === "failed"
        ? "GitHub review unavailable: listed under Incomplete"
        : "Provisional: ranked below complete applicants until the GitHub review finishes.";
  } else if (isTechnical && score != null && fitScore != null && githubOverall != null) {
    const scaled = ((githubOverall - 1) / 9) * 100;
    body = `Rank score ${score.toFixed(2)} = 70% × fit ${formatFit(fitScore)} + 30% × GitHub ${scaled.toFixed(1)} (${githubOverall.toFixed(2)} / 10 scaled 1–10 → 0–100)`;
  } else if (score != null && fitScore != null) {
    body = `Rank score ${score.toFixed(2)} = fit score ${formatFit(fitScore)}`;
  }

  const showFitAside = tier === 1 && fitScore != null;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-1">
      <h2 className="text-h3">Rank score</h2>
      {position != null && <p className="mt-1 text-small tabular-nums text-muted-foreground">#{position}</p>}
      <p className="mt-2 text-body text-copy tabular-nums">{body}</p>
      {showFitAside && (
        <p className="mt-1 text-small tabular-nums text-muted-foreground">Fit score {formatFit(fitScore)}</p>
      )}
    </section>
  );
}
