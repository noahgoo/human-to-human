import { describe, expect, it } from "vitest";
import { loadApplicantsPage } from "@/lib/data/pipeline";

describe("recruiter pipeline joins", () => {
  it("attaches Jev sub-scores and repo rows for the Redo returns product role", async () => {
    const page = await loadApplicantsPage("job-redo-product", "co-redo", {
      status: "active",
      sort: "rank",
      minConfidence: null,
      includeIncomplete: true,
      cursor: null,
      limit: 50,
    });
    expect(page).not.toBeNull();
    const complete = page!.rows.find((row) => row.application.id === "app-avery-neighbor");
    expect(complete?.fit.score).toBe(92);
    expect(complete?.fit.jev.richMedia).not.toBeNull();
    expect(complete?.fit.jev.profile).not.toBeNull();
    expect(complete?.fit.jev.resume).not.toBeNull();
    expect(complete?.repo?.repoUrl).toMatch(/^https:\/\/github.com\//);
    expect(complete?.repo?.scores?.dataArchitecture).toBe(8);
  });
});
