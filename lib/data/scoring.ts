import type { FitEvaluation } from "@/lib/types";

export interface SavedJevScores {
  richMedia: number | null;
  profile: number | null;
  resume: number | null;
  average: number | null;
}

const JEV_LABEL = {
  richMedia: "LinkedIn rich media",
  profile: "LinkedIn profile",
  resume: "Resume",
} as const;

function scoreFromEvidence(fit: FitEvaluation | undefined, label: string): number | null {
  const evidence = fit?.requirements.find((item) => item.requirement === label)?.evidence;
  const match = evidence?.match(/Jev score (\d+)/);
  return match ? Number(match[1]) : null;
}

/** Jev sub-scores (0–100) plus overall fit confidence from a stored fit evaluation. */
export function jevScoresFromFit(fit: FitEvaluation | undefined): SavedJevScores {
  const saved = fit?.sourceScores;
  const succeeded = fit?.status === "succeeded";
  return {
    richMedia: saved?.richMedia ?? scoreFromEvidence(fit, JEV_LABEL.richMedia),
    profile: saved?.profile ?? scoreFromEvidence(fit, JEV_LABEL.profile),
    resume: saved?.resume ?? scoreFromEvidence(fit, JEV_LABEL.resume),
    average: succeeded ? (fit?.confidenceScore ?? null) : null,
  };
}

/** Stored repo category scores are 1–10; display as 1–100 for recruiters. */
export function repoCategoryDisplayScore(scoreOnTen: number): number {
  return Math.min(100, Math.max(1, Math.round(scoreOnTen * 10)));
}

export function repoOverallDisplayScore(overallOnTen: number): number {
  return repoCategoryDisplayScore(overallOnTen);
}
