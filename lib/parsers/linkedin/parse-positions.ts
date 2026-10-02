import Papa from "papaparse";
import { CsvParseError } from "@/lib/parsers/linkedin/fit-sources";

export type ParsedPosition = {
  companyName: string;
  title: string | null;
  description: string | null;
  location: string | null;
  startedOn: string | null;
  endedOn: string | null;
};

const ALIASES: Record<string, string[]> = {
  companyName: ["company name", "company"],
  title: ["title", "position"],
  description: ["description"],
  location: ["location"],
  startedOn: ["started on", "start date"],
  endedOn: ["finished on", "end date", "ended on"],
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

function columnMap(header: string[]): Record<string, number> {
  const columns: Record<string, number> = {};
  header.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    for (const [field, names] of Object.entries(ALIASES)) {
      if (names.includes(key) && columns[field] === undefined) columns[field] = index;
    }
  });
  return columns;
}

function cell(row: string[], index: number | undefined): string {
  if (index === undefined) return "";
  return (row[index] ?? "").trim();
}

/** Best-effort ISO date (YYYY-MM-DD) for Postgres date columns. */
export function linkedInDateToIso(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const present = /^(present|current)$/i.test(text);
  if (present) return null;
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  const monthYear = text.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (monthYear) {
    const d = Date.parse(`${monthYear[1]} 1, ${monthYear[2]}`);
    if (!Number.isNaN(d)) return new Date(d).toISOString().slice(0, 10);
  }
  const yearOnly = text.match(/^(\d{4})$/);
  if (yearOnly) return `${yearOnly[1]}-01-01`;
  return null;
}

export function parsePositionsCsv(csv: string): ParsedPosition[] {
  const rows = parseRows(csv);
  if (rows.length < 2) throw new CsvParseError("Positions.csv has no data rows.");
  const columns = columnMap(rows[0] ?? []);
  if (columns.companyName === undefined) {
    throw new CsvParseError("Positions.csv is missing a Company Name column.");
  }
  const out: ParsedPosition[] = [];
  for (const row of rows.slice(1)) {
    const companyName = cell(row, columns.companyName);
    if (!companyName) continue;
    out.push({
      companyName: companyName.slice(0, 300),
      title: cell(row, columns.title).slice(0, 300) || null,
      description: cell(row, columns.description).slice(0, 5000) || null,
      location: cell(row, columns.location).slice(0, 200) || null,
      startedOn: linkedInDateToIso(cell(row, columns.startedOn)),
      endedOn: linkedInDateToIso(cell(row, columns.endedOn)),
    });
    if (out.length >= 300) break;
  }
  return out;
}
