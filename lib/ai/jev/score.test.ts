import { describe, expect, it } from "vitest";
import { jevCompareCalls } from "@/lib/ai/jev/agents";
import { aggregateFit, confidenceFromDistribution, distributionFromAnswer } from "@/lib/ai/jev/score";

describe("confidenceFromDistribution", () => {
  it("maps the five anchors onto 0–100", () => {
    expect(confidenceFromDistribution([1, 0, 0, 0, 0])).toBe(0);
    expect(confidenceFromDistribution([0, 1, 0, 0, 0])).toBe(25);
    expect(confidenceFromDistribution([0, 0, 1, 0, 0])).toBe(50);
    expect(confidenceFromDistribution([0, 0, 0, 0, 1])).toBe(100);
    expect(confidenceFromDistribution([0.5, 0, 0, 0, 0.5])).toBe(50);
  });

  it("reads Jev's index-keyed probabilities and normalizes them", () => {
    expect(distributionFromAnswer({ probabilities: { "0": 0, "4": 2 } })).toEqual([0, 0, 0, 0, 1]);
    expect(confidenceFromDistribution(distributionFromAnswer({ probabilities: { "0": 0, "4": 1 } }))).toBe(100);
    expect(confidenceFromDistribution([2, 0, 0, 0, 2])).toBe(50);
  });
});

describe("jevCompareCalls", () => {
  it("scores resume, profile, and rich media only", () => {
    const calls = jevCompareCalls({
      richMedia: "shipped a billing service",
      profile: "backend engineer",
      resume: "Go and PostgreSQL",
    });
    expect(calls.map((call) => call.source).sort()).toEqual([
      "profile",
      "profile",
      "resume",
      "richMedia",
      "richMedia",
    ]);
    expect(calls.every((call) => call.source === "profile" || call.source === "richMedia" || call.source === "resume")).toBe(
      true,
    );
    expect(calls.filter((call) => call.source === "resume").map((call) => call.agent)).toEqual(["resumeAnalyst"]);
  });
});

describe("aggregateFit", () => {
  it("averages source scores per agent, then averages the two agents", () => {
    const preview = aggregateFit([
      { agent: "softwareEngineer", source: "profile", distribution: [0, 0, 0, 0, 1] },
      { agent: "softwareEngineer", source: "github", distribution: [0, 0, 0, 1, 0] },
      { agent: "dataScientist", source: "richMedia", distribution: [0, 0, 1, 0, 0] },
    ]);
    expect(preview.agents.softwareEngineer?.sources.profile?.score).toBe(100);
    expect(preview.agents.softwareEngineer?.sources.github?.score).toBe(75);
    expect(preview.agents.softwareEngineer?.confidenceScore).toBe(88);
    expect(preview.agents.dataScientist?.confidenceScore).toBe(50);
    expect(preview.confidenceScore).toBe(69);
    expect(preview.band).toBe("moderate");
    expect(preview.agents.softwareEngineer?.sources.richMedia).toBeUndefined();
  });

  it("includes a resume analyst when resume is scored", () => {
    const preview = aggregateFit([
      { agent: "softwareEngineer", source: "profile", distribution: [0, 0, 0, 0, 1] },
      { agent: "resumeAnalyst", source: "resume", distribution: [0, 0, 0, 1, 0] },
    ]);
    expect(preview.agents.resumeAnalyst?.sources.resume?.score).toBe(75);
    expect(preview.confidenceScore).toBe(88);
  });
});
