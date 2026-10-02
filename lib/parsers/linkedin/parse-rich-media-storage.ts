import Papa from "papaparse";
import { CsvParseError } from "@/lib/parsers/linkedin/fit-sources";

export type StoredRichMediaRow = {
  occurredAt: string | null;
  description: string;
  mediaLink: string | null;
};

const ALIASES: Record<string, string[]> = {
  occurredAt: ["date/time", "date", "datetime"],
  description: ["media description", "description"],
  mediaLink: ["media link", "link", "url"],
};

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function parseRows(csv: string): string[][] {
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), {
    header: false,
    skipEmptyLines: "greedy",
  });
  return parsed.data.filter((row) => row.some((cell) => cell.trim() !== ""));
}

export function parseRichMediaForStorage(csv: string): StoredRichMediaRow[] {
  const rows = parseRows(csv);
  let headerIndex = -1;
  let columns: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 5); i += 1) {
    const map: Record<string, number> = {};
    (rows[i] ?? []).forEach((cell, col) => {
      const key = normalizeHeader(cell);
      for (const [field, names] of Object.entries(ALIASES)) {
        if (names.includes(key) && map[field] === undefined) map[field] = col;
      }
    });
    if (map.description !== undefined) {
      headerIndex = i;
      columns = map;
      break;
    }
  }
  if (headerIndex < 0) throw new CsvParseError("Rich_Media.csv is missing a Media Description column.");
  const out: StoredRichMediaRow[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const description = (row[columns.description!] ?? "").trim().slice(0, 5000);
    if (!description) continue;
    const occurredAt = columns.occurredAt !== undefined ? (row[columns.occurredAt] ?? "").trim().slice(0, 500) || null : null;
    const mediaLink =
      columns.mediaLink !== undefined ? (row[columns.mediaLink] ?? "").trim().slice(0, 2000) || null : null;
    out.push({ occurredAt, description, mediaLink });
    if (out.length >= 100) break;
  }
  return out;
}
