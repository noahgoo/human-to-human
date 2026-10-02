import type { GithubReview, GithubTopicScore } from "@/lib/ai/repo/topics";
import type { RepoCategory } from "@/lib/types";

const CATEGORY_SUBTOPICS: Record<RepoCategory, string[]> = {
  security: ["consistencyCompliance"],
  organization: ["standardsPatterns", "documentation", "onboardingOwnership", "dataFlowStorage", "technicalDebt"],
  performance: [
    "throughputLatency",
    "highAvailability",
    "resourceOptimization",
    "infrastructureAsCode",
    "observabilityMonitoring",
  ],
  testing: ["testCoverage", "automationPipelines"],
};

const CATEGORIES: RepoCategory[] = ["security", "organization", "performance", "testing"];

/** Maps the 1–100 topic review onto the recruiter categories, which are 1–10. */
export function recruiterRepoFromReview(review: GithubReview): {
  scores: Record<RepoCategory, number>;
  overall: number;
  rationale: Partial<Record<RepoCategory, string>>;
} {
  const byId = new Map<string, GithubTopicScore["subtopics"][number]>(
    review.topics.flatMap((topic) => topic.subtopics.map((subtopic) => [subtopic.id, subtopic])),
  );
  const scores = {} as Record<RepoCategory, number>;
  const rationale: Partial<Record<RepoCategory, string>> = {};
  for (const category of CATEGORIES) {
    const items = CATEGORY_SUBTOPICS[category]
      .map((id) => byId.get(id))
      .filter((item): item is GithubTopicScore["subtopics"][number] => item != null);
    const mean = items.reduce((sum, item) => sum + item.score, 0) / Math.max(items.length, 1);
    scores[category] = clamp10(mean / 10);
    const sentence = items.map((item) => item.evidence.trim()).find(Boolean);
    if (sentence) rationale[category] = sentence;
  }
  const overall = Math.round(((scores.security + scores.organization + scores.performance + scores.testing) / 4) * 100) / 100;
  return { scores, overall, rationale };
}

function clamp10(score: number): number {
  return Math.min(10, Math.max(1, Math.round(score)));
}
