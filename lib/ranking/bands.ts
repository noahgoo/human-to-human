import type { FitBand } from "@/lib/types";

export function bandFor(score: number): FitBand {
  if (score >= 85) return "strong";
  if (score >= 70) return "good";
  if (score >= 50) return "moderate";
  return "limited";
}

export const BAND_LABEL: Record<FitBand, string> = {
  strong: "Strong match",
  good: "Good match",
  moderate: "Moderate match",
  limited: "Limited match",
};

/** D-05: technical = 0.7·confidence + 0.3·(githubOverall − 1)/9·100; otherwise confidence. */
export function rankScore(confidence: number, githubOverall: number | null, isTechnical: boolean): number {
  if (!isTechnical || githubOverall == null) return confidence;
  return 0.7 * confidence + 0.3 * (((githubOverall - 1) / 9) * 100);
}
