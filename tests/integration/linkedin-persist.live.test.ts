import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { extractOnboardingCsvs } from "@/lib/linkedin/extract-csvs";
import { persistLinkedInOnboardingImport } from "@/lib/linkedin/persist-import";

const FIXTURE_DIR =
  process.env.LINKEDIN_EXPORT_DIR ??
  "/Users/carterlee/Downloads/Basic_LinkedInDataExport_10-02-2026.zip";

describe("persist LinkedIn import to Supabase", () => {
  it("writes Noah fixture to Supabase", async () => {
    if (!isSupabaseConfigured()) return;
    const names = ["Profile.csv", "Positions.csv", "Connections.csv", "Rich_Media.csv"] as const;
    const files = names.map(
      (name) => new File([fs.readFileSync(path.join(FIXTURE_DIR, name))], name, { type: "text/csv" }),
    );
    const csvs = await extractOnboardingCsvs(files);
    const info = await persistLinkedInOnboardingImport(
      "2a9f4a36-e539-4508-aeb6-69f762f8d889",
      csvs,
      "csv",
    );
    expect(info.status).toBe("succeeded");
    expect(info.counts.connections).toBeGreaterThan(50);
  });
});
