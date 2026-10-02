import { CsvParseError, parseProfileCsv } from "@/lib/parsers/linkedin/fit-sources";
import Papa from "papaparse";

export type StoredProfile = {
  headline: string | null;
  summary: string | null;
  industry: string | null;
  geoLocation: string | null;
  profileCsv: string;
};

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

export function parseProfileForStorage(csv: string): StoredProfile {
  const parsed = parseProfileCsv(csv);
  const rows = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), { header: false, skipEmptyLines: "greedy" }).data;
  const header = rows[0] ?? [];
  let geoLocation: string | null = null;
  header.forEach((cell, index) => {
    if (normalizeHeader(cell) === "geo location") {
      const value = (rows[1]?.[index] ?? "").trim().slice(0, 200);
      geoLocation = value || null;
    }
  });
  if (!parsed.headline && !parsed.summary) {
    throw new CsvParseError("Profile.csv has no usable profile row.");
  }
  return {
    headline: parsed.headline.slice(0, 300) || null,
    summary: parsed.summary.slice(0, 5000) || null,
    industry: parsed.industry.slice(0, 200) || null,
    geoLocation,
    profileCsv: csv.slice(0, 500_000),
  };
}
