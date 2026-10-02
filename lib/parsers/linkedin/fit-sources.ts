import Papa from "papaparse";

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

/** Fields sent to Jev. Name, address, birth date, and zip never appear here. */
export type ParsedProfile = {
  headline: string;
  summary: string;
  industry: string;
  /** Headline, summary, and websites, used only to find a GitHub login. */
  githubSearchText: string;
};

/** Company and title only. Names, emails, and profile URLs are not returned. */
export type ConnectionRow = {
  company: string | null;
  position: string | null;
  connectedOn: string | null;
};

export type ParsedConnections = {
  count: number;
  rows: ConnectionRow[];
};

const PROFILE_ALIASES: Record<string, string[]> = {
  headline: ["headline"],
  summary: ["summary", "about"],
  industry: ["industry"],
  websites: ["websites", "website"],
};

const RICH_MEDIA_ALIASES: Record<string, string[]> = {
  description: ["media description", "description"],
};

const CONNECTION_ALIASES: Record<string, string[]> = {
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  company: ["company", "company name", "current company", "organization"],
  position: ["position", "title", "job title", "headline"],
  connectedOn: ["connected on", "connection date", "connected"],
  email: ["email address", "e mail address", "email"],
  url: ["url", "profile url"],
};

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function cleanField(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseRows(csv: string): string[][] {
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), {
    header: false,
    skipEmptyLines: "greedy",
  });
  return parsed.data.filter((row) => row.some((cell) => cell.trim() !== ""));
}

function columnMap(
  header: string[],
  aliases: Record<string, string[]>,
): Record<string, number> {
  const columns: Record<string, number> = {};
  header.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    for (const [field, names] of Object.entries(aliases)) {
      if (names.includes(key) && columns[field] === undefined) columns[field] = index;
    }
  });
  return columns;
}

function findHeader(
  rows: string[][],
  aliases: Record<string, string[]>,
  accept: (columns: Record<string, number>) => boolean,
): { index: number; columns: Record<string, number> } {
  const limit = Math.min(rows.length, 20);
  for (let index = 0; index < limit; index += 1) {
    const columns = columnMap(rows[index] ?? [], aliases);
    const mapped = Object.keys(columns).length;
    if (mapped >= 1 && accept(columns)) return { index, columns };
  }
  throw new CsvParseError("header not found");
}

function cell(row: string[], index: number | undefined): string {
  if (index === undefined) return "";
  return cleanField(row[index] ?? "");
}

export function parseProfileCsv(csv: string): ParsedProfile {
  const rows = parseRows(csv);
  let header: { index: number; columns: Record<string, number> };
  try {
    header = findHeader(rows, PROFILE_ALIASES, (columns) => columns.headline !== undefined);
  } catch {
    throw new CsvParseError("Profile.csv is missing a Headline column.");
  }
  const data = rows[header.index + 1];
  if (!data) throw new CsvParseError("Profile.csv has no profile row.");
  const headline = cell(data, header.columns.headline);
  const summary = cell(data, header.columns.summary);
  const industry = cell(data, header.columns.industry);
  const websites = cell(data, header.columns.websites);
  return {
    headline,
    summary,
    industry,
    githubSearchText: [headline, summary, websites].filter(Boolean).join("\n"),
  };
}

export function profileEvidenceText(profile: ParsedProfile): string {
  return [
    profile.headline && `Headline: ${profile.headline}`,
    profile.summary && `Summary: ${profile.summary}`,
    profile.industry && `Industry: ${profile.industry}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseRichMediaCsv(csv: string): string[] {
  const rows = parseRows(csv);
  let header: { index: number; columns: Record<string, number> };
  try {
    header = findHeader(rows, RICH_MEDIA_ALIASES, (columns) => columns.description !== undefined);
  } catch {
    throw new CsvParseError("Rich_Media.csv is missing a Media Description column.");
  }
  const descriptions: string[] = [];
  for (const row of rows.slice(header.index + 1)) {
    const description = cell(row, header.columns.description);
    if (!description || description === "-" || description === "—") continue;
    descriptions.push(description.slice(0, 1_500));
    if (descriptions.length >= 40) break;
  }
  return descriptions;
}

export function richMediaEvidenceText(descriptions: string[]): string {
  return descriptions.join("\n\n").slice(0, 20_000);
}

export function parseConnectionsCsv(csv: string): ParsedConnections {
  const rows = parseRows(csv);
  let header: { index: number; columns: Record<string, number> };
  try {
    header = findHeader(
      rows,
      CONNECTION_ALIASES,
      (columns) =>
        columns.company !== undefined &&
        (columns.firstName !== undefined || columns.lastName !== undefined),
    );
  } catch {
    throw new CsvParseError("Connections.csv is missing the Company column.");
  }
  const projected: ConnectionRow[] = [];
  for (const row of rows.slice(header.index + 1)) {
    const company = cell(row, header.columns.company);
    const position = cell(row, header.columns.position);
    const connectedOn = cell(row, header.columns.connectedOn);
    if (!company && !position && !connectedOn) continue;
    projected.push({
      company: company || null,
      position: position || null,
      connectedOn: connectedOn || null,
    });
  }
  return { count: projected.length, rows: projected };
}
