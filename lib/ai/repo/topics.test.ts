import { describe, expect, it } from "vitest";
import { REPO_SUBTOPICS, rollupTopicScores } from "@/lib/ai/repo/topics";

describe("rollupTopicScores", () => {
  it("averages subtopic scores into each topic and an overall score", () => {
    const judgements = Object.fromEntries(
      REPO_SUBTOPICS.map((subtopic, index) => [subtopic.id, { score: index % 2 === 0 ? 80 : 40, evidence: `${subtopic.id} noted in README.md` }]),
    );
    const rolled = rollupTopicScores(judgements);
    const data = rolled.topics.find((topic) => topic.id === "dataArchitecture");
    expect(data?.subtopics.map((subtopic) => subtopic.score)).toEqual([80, 40]);
    expect(data?.score).toBe(60);
    expect(rolled.overall).toBeGreaterThanOrEqual(1);
    expect(rolled.overall).toBeLessThanOrEqual(100);
    expect(rolled.topics).toHaveLength(5);
    expect(rolled.topics.flatMap((topic) => topic.subtopics)).toHaveLength(13);
  });

  it("clamps scores onto 1–100", () => {
    const judgements = Object.fromEntries(
      REPO_SUBTOPICS.map((subtopic) => [subtopic.id, { score: 0.4, evidence: "No evidence in the sample." }]),
    );
    const rolled = rollupTopicScores(judgements);
    expect(rolled.topics.every((topic) => topic.score === 1)).toBe(true);
  });
});