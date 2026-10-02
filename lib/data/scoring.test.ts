import { describe, expect, it } from "vitest";
import { jevScoresFromFit, repoCategoryDisplayScore, repoOverallDisplayScore } from "@/lib/data/scoring";
import type { FitEvaluation } from "@/lib/types";

describe("jevScoresFromFit", () => {
  it("reads sourceScores when present", () => {
    const fit: FitEvaluation = {
      id: "fit-1",
      jobId: "job-1",
      applicantId: "user-1",
      status: "succeeded",
      confidenceScore: 82,
      band: "good",
      explanation: null,
      requirements: [],
      sourceScores: { richMedia: 75, profile: 80, resume: 88 },
      createdAt: new Date().toISOString(),
    };
    expect(jevScoresFromFit(fit)).toEqual({
      richMedia: 75,
      profile: 80,
      resume: 88,
      average: 82,
    });
  });

  it("parses Jev score from requirement evidence as fallback", () => {
    const fit: FitEvaluation = {
      id: "fit-2",
      jobId: "job-1",
      applicantId: "user-1",
      status: "succeeded",
      confidenceScore: 70,
      band: "moderate",
      explanation: null,
      requirements: [{ requirement: "LinkedIn profile", met: "partial", evidence: "Jev score 66" }],
      createdAt: new Date().toISOString(),
    };
    expect(jevScoresFromFit(fit).profile).toBe(66);
  });
});

describe("repo display scale", () => {
  it("maps 1–10 storage to 1–100 display", () => {
    expect(repoCategoryDisplayScore(8.5)).toBe(85);
    expect(repoOverallDisplayScore(7.2)).toBe(72);
  });
});
