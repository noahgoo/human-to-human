import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractOnboardingCsvs } from "@/lib/linkedin/extract-csvs";
import { parseProfileForStorage } from "@/lib/parsers/linkedin/parse-profile-storage";
import { parsePositionsCsv } from "@/lib/parsers/linkedin/parse-positions";
import { parseConnectionsForStorage } from "@/lib/parsers/linkedin/parse-connections-storage";
import { parseRichMediaForStorage } from "@/lib/parsers/linkedin/parse-rich-media-storage";

const FIXTURE_DIR =
  process.env.LINKEDIN_EXPORT_DIR ??
  "/Users/carterlee/Downloads/Basic_LinkedInDataExport_10-02-2026.zip";

function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

describe("onboarding LinkedIn parsers", () => {
  it("parses the Basic export fixture", () => {
    const profile = parseProfileForStorage(fixture("Profile.csv"));
    expect(profile.headline).toContain("BYU");
    const positions = parsePositionsCsv(fixture("Positions.csv"));
    expect(positions.length).toBeGreaterThan(0);
    const connections = parseConnectionsForStorage(fixture("Connections.csv"));
    expect(connections.length).toBeGreaterThan(10);
    expect(connections.every((r) => !("url" in r))).toBe(true);
    const rich = parseRichMediaForStorage(fixture("Rich_Media.csv"));
    expect(rich.length).toBeGreaterThan(0);
  });

  it("extracts four CSV kinds from files", async () => {
    const names = ["Profile.csv", "Positions.csv", "Connections.csv", "Rich_Media.csv"] as const;
    const files = names.map((name) => new File([fixture(name)], name, { type: "text/csv" }));
    const csvs = await extractOnboardingCsvs(files);
    expect(Object.keys(csvs).sort()).toEqual(["Connections", "Positions", "Profile", "Rich_Media"]);
  });
});
