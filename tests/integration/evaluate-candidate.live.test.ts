import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { evaluateCandidate } from "@/lib/ai/jev/evaluate";
import {
  FIXTURE_CONNECTIONS_CSV,
  FIXTURE_JOB,
  FIXTURE_PROFILE_CSV,
  FIXTURE_RESUME,
  FIXTURE_RICH_MEDIA_CSV,
} from "../fixtures/linkedin-export";
import { mockGithubFetch } from "../helpers/mock-github-fetch";

const live = Boolean(process.env.OPENROUTER_API_KEY?.trim());

describe.skipIf(!live)("evaluateCandidate (live Jev)", () => {
  beforeAll(() => {
    process.env.FIT_PREVIEW_GITHUB_GPT = "false";
  });

  it(
    "scores fixture LinkedIn export and resume with both engineer agents and resume analyst",
    async () => {
      const result = await evaluateCandidate({
        ...FIXTURE_JOB,
        profileCsv: FIXTURE_PROFILE_CSV,
        richMediaCsv: FIXTURE_RICH_MEDIA_CSV,
        connectionsCsv: FIXTURE_CONNECTIONS_CSV,
        resumeText: FIXTURE_RESUME,
        fetchImpl: mockGithubFetch(),
      });

      expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(result.confidenceScore).toBeLessThanOrEqual(100);
      expect(["strong", "good", "moderate", "limited"]).toContain(result.band);
      expect(result.agents.engineeringHiringManager?.confidenceScore).toBeDefined();
      expect(result.agents.dataHiringManager?.confidenceScore).toBeDefined();
      expect(result.agents.resumeAnalyst?.sources.resume?.score).toBeDefined();
      expect(result.githubReview).toBeNull();
    },
    180_000,
  );

  const exportDir =
    process.env.LINKEDIN_EXPORT_DIR ??
    "/Users/carterlee/Downloads/Basic_LinkedInDataExport_10-02-2026.zip";

  it.skipIf(!fs.existsSync(path.join(exportDir, "Profile.csv")))(
    "scores the local LinkedIn export directory when present",
    async () => {
      const result = await evaluateCandidate({
        jobTitle: "Software Engineering Intern",
        jobRequirements: "Python or JavaScript, web development, internships, cybersecurity interest.",
        profileCsv: fs.readFileSync(path.join(exportDir, "Profile.csv"), "utf8"),
        richMediaCsv: fs.readFileSync(path.join(exportDir, "Rich_Media.csv"), "utf8"),
        connectionsCsv: fs.readFileSync(path.join(exportDir, "Connections.csv"), "utf8"),
        fetchImpl: mockGithubFetch(),
      });
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(result.agents.engineeringHiringManager).toBeDefined();
    },
    300_000,
  );
});
