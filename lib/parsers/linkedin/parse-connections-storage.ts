import Papa from "papaparse";
import { CsvParseError } from "@/lib/parsers/linkedin/fit-sources";
import { linkedInDateToIso } from "@/lib/parsers/linkedin/parse-positions";

export type StoredConnectionRow = {
  firstName: string;
  lastName: string;
  companyName: string | null;
  position: string | null;
  connectedOn: string | null;
};

const ALIASES: Record<string, string[]> = {
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  company: ["company", "company name"],
  position: ["position", "title"],
  connectedOn: ["connected on", "connection date"],
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

function findHeader(rows: string[][]): { index: number; columns: Record<string, number> } {
  const limit = Math.min(rows.length, 20);
  for (let index = 0; index < limit; index += 1) {
    const columns: Record<string, number> = {};
    (rows[index] ?? []).forEach((cell, col) => {
      const key = normalizeHeader(cell);
      for (const [field, names] of Object.entries(ALIASES)) {
        if (names.includes(key) && columns[field] === undefined) columns[field] = col;
      }
    });
    if (columns.company !== undefined && (columns.firstName !== undefined || columns.lastName !== undefined)) {
      return { index, columns };
    }
  }
  throw new CsvParseError("Connections.csv is missing required columns.");
}

function cell(row: string[], index: number | undefined): string {
  if (index === undefined) return "";
  return (row[index] ?? "").trim();
}

/** Parses Connections.csv for database storage (no URL or email). */
export function parseConnectionsForStorage(csv: string): StoredConnectionRow[] {
  const rows = parseRows(csv);
  const header = findHeader(rows);
  const out: StoredConnectionRow[] = [];
  for (const row of rows.slice(header.index + 1)) {
    const firstName = cell(row, header.columns.firstName).slice(0, 100);
    const lastName = cell(row, header.columns.lastName).slice(0, 100);
    const companyName = cell(row, header.columns.company).slice(0, 300) || null;
    const position = cell(row, header.columns.position).slice(0, 300) || null;
    const connectedOn = linkedInDateToIso(cell(row, header.columns.connectedOn));
    if (!firstName && !lastName && !companyName && !position) continue;
    out.push({ firstName, lastName, companyName, position, connectedOn });
    if (out.length >= 35_000) break;
  }
  return out;
}
