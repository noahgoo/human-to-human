import type { GithubReview, GithubTopicScore } from "@/lib/ai/repo/topics";
import type { RepoCategory } from "@/lib/types";

const CATEGORY_SUBTOPICS: Record<RepoCategory, string[]> = {
  dataArchitecture: ["dataFlowStorage", "consistencyCompliance"],
  performance: ["throughputLatency", "highAvailability", "resourceOptimization"],
  deployment: ["automationPipelines", "observabilityMonitoring", "infrastructureAsCode"],
  codeQuality: ["standardsPatterns", "testCoverage", "technicalDebt"],
  teamTopology: ["documentation", "onboardingOwnership"],
};

const CATEGORIES: RepoCategory[] = ["dataArchitecture", "performance", "deployment", "codeQuality", "teamTopology"];

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
  const overall =
    Math.round(
      ((scores.dataArchitecture + scores.performance + scores.deployment + scores.codeQuality + scores.teamTopology) /
        5) *
        100,
    ) / 100;
  return { scores, overall, rationale };
}

function clamp10(score: number): number {
  return Math.min(10, Math.max(1, Math.round(score)));
}
