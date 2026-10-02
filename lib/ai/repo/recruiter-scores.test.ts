import { describe, expect, it } from "vitest";
import { recruiterRepoFromReview } from "@/lib/ai/repo/recruiter-scores";
import { REPO_TOPICS, type GithubReview } from "@/lib/ai/repo/topics";

function reviewWith(score: number): GithubReview {
  return {
    status: "succeeded",
    login: "ada",
    repos: ["ledger"],
    filesReviewed: 4,
    model: "test",
    overall: score,
    topics: REPO_TOPICS.map((topic) => ({
      id: topic.id,
      label: topic.label,
      score,
      subtopics: topic.subtopics.map((subtopic) => ({
        id: subtopic.id,
        label: subtopic.label,
        score,
        evidence: `${subtopic.label} is visible in README.md`,
      })),
    })),
  };
}

describe("recruiterRepoFromReview", () => {
  it("scales 1–100 topic scores onto the 1–10 recruiter categories", () => {
    const mapped = recruiterRepoFromReview(reviewWith(84));
    expect(mapped.scores).toEqual({ security: 8, organization: 8, performance: 8, testing: 8 });
    expect(mapped.overall).toBe(8);
    expect(mapped.rationale.testing).toContain("Test Coverage");
  });

  it("keeps a weak sample at the bottom of the 1–10 scale", () => {
    const mapped = recruiterRepoFromReview(reviewWith(1));
    expect(mapped.scores.security).toBe(1);
    expect(mapped.overall).toBe(1);
  });
});
