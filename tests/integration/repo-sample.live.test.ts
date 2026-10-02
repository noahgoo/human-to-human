import { describe, expect, it } from "vitest";
import { recruiterRepoFromReview } from "@/lib/ai/repo/recruiter-scores";
import { collectRepoSample, scoreRepoSample } from "@/lib/ai/repo/review";
import { REPO_CATEGORY_LABEL } from "@/lib/copy";
import { loadPublicRepo } from "@/lib/github/public-projects";
import type { RepoCategory } from "@/lib/types";

const live = Boolean(process.env.OPENROUTER_API_KEY?.trim());

const REPOS = ["Youth_goal_tracker", "chess"] as const;

describe.skipIf(!live)("public GitHub repo samples", () => {
  it.each(REPOS)(
    "reviews %s from source files and prints category scores out of 100",
    async (name) => {
      const loaded = await loadPublicRepo("Tarotar30127", name);
      expect(loaded).not.toBeNull();
      const sample = await collectRepoSample("Tarotar30127", [loaded!.project]);
      const paths = sample.files.map((file) => file.path);
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.some((path) => path === "README.md" || !path.toLowerCase().includes("readme"))).toBe(true);
      if (name === "Youth_goal_tracker") {
        expect(paths.some((path) => /^(app|src|supabase)\//.test(path))).toBe(true);
        expect(paths.some((path) => path.startsWith("design/") || path.startsWith("public/"))).toBe(false);
      }
      if (name === "chess") {
        expect(paths.some((path) => /^(client|server|shared)\//.test(path))).toBe(true);
        expect(paths.some((path) => path.startsWith("starter-code/"))).toBe(false);
      }

      const review = await scoreRepoSample("Tarotar30127", sample.files);
      const mapped = recruiterRepoFromReview(review);
      const lines = (Object.keys(REPO_CATEGORY_LABEL) as RepoCategory[]).map(
        (category) => `${REPO_CATEGORY_LABEL[category]} (${mapped.scores[category] * 10}/100)`,
      );
      console.log(`\n${name}\nfiles: ${paths.join(", ")}\n${lines.join("\n")}\nAverage (${mapped.overall * 10}/100)\n${mapped.gaps ?? ""}`);
      expect(mapped.overall).toBeGreaterThanOrEqual(1);
      expect(mapped.overall).toBeLessThanOrEqual(10);
    },
    180_000,
  );
});
