import { describe, expect, it } from "vitest";
import { scoreEvidence } from "@/lib/ai/jev/client";
import { confidenceFromDistribution } from "@/lib/ai/jev/score";
import { FIXTURE_JOB } from "../fixtures/linkedin-export";

const live = Boolean(process.env.OPENROUTER_API_KEY?.trim());

describe.skipIf(!live)("Jev client (live OpenRouter)", () => {
  it(
    "returns a normalized 5-bin distribution for a profile evidence call",
    async () => {
      const distribution = await scoreEvidence({
        agent: "engineeringHiringManager",
        source: "profile",
        jobTitle: FIXTURE_JOB.jobTitle,
        jobRequirements: FIXTURE_JOB.jobRequirements,
        evidence: "Backend engineer. Built payment APIs in Go and PostgreSQL for 3 years.",
      });
      expect(distribution).toHaveLength(5);
      const sum = distribution.reduce((total, value) => total + value, 0);
      expect(sum).toBeCloseTo(1, 5);
      distribution.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
      const score = confidenceFromDistribution(distribution);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    },
    45_000,
  );
});
