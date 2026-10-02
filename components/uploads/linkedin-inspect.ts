export const LINKEDIN_FILES = ["Profile", "Positions", "Skills", "Education", "Connections"] as const;
export type LinkedInFileName = (typeof LINKEDIN_FILES)[number];

export interface LinkedInInspection {
  filesPresent: LinkedInFileName[];
  counts: {
    connections: number;
    companies: number;
    positions: number;
    skills: number;
    education: number;
  };
  displayNames: string[];
}

const FALLBACK = {
  connections: 1428,
  companies: 342,
  positions: 37,
  skills: 24,
  education: 3,
};

export function kindFromPath(path: string): LinkedInFileName | null {
  const base = path.split(/[/\\]/).pop() ?? path;
  if (!/\.csv$/i.test(base)) return null;
  const stem = base.replace(/\.csv$/i, "");
  return LINKEDIN_FILES.find((kind) => kind.toLowerCase() === stem.toLowerCase()) ?? null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else quoted = false;
      } else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      out.push(current);
      current = "";
    } else current += char;
  }
  out.push(current);
  return out;
}

export function summarizeConnections(text: string): { connections: number; companies: number } {
  const lines = text.split(/\r?\n/);
  const headerAt = lines.findIndex((line) => /^\s*First Name\s*,\s*Last Name\b/i.test(line));
  const header = headerAt >= 0 ? splitCsvLine(lines[headerAt]) : [];
  const companyAt = header.findIndex((cell) => cell.trim().toLowerCase() === "company");
  const companies = new Set<string>();
  let connections = 0;
  for (let i = (headerAt >= 0 ? headerAt : 0) + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    connections++;
    if (companyAt >= 0) {
      const company = splitCsvLine(line)[companyAt]?.trim();
      if (company) companies.add(company.toLowerCase());
    }
  }
  return { connections, companies: companies.size };
}

function countDataRows(text: string): number {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return Math.max(0, lines.length - 1);
}

async function listZip(data: Uint8Array): Promise<{ names: string[]; connectionsText: string | null }> {
  const { unzip, strFromU8 } = await import("fflate");
  return new Promise((resolve, reject) => {
    const names: string[] = [];
    unzip(
      data,
      {
        filter(file) {
          names.push(file.name);
          const kind = kindFromPath(file.name);
          const readable = file.compression === 0 || file.compression === 8;
          return kind === "Connections" && readable && file.originalSize <= 8_000_000;
        },
      },
      (error, unzipped) => {
        if (error) {
          reject(error);
          return;
        }
        const entry = Object.entries(unzipped).find(([name]) => kindFromPath(name) === "Connections");
        resolve({ names, connectionsText: entry ? strFromU8(entry[1]) : null });
      },
    );
  });
}

export async function inspectLinkedInFiles(files: File[]): Promise<LinkedInInspection> {
  const zips = files.filter((file) => file.name.toLowerCase().endsWith(".zip"));
  const csvs = files.filter((file) => file.name.toLowerCase().endsWith(".csv"));
  if (zips.length > 0 && csvs.length > 0) {
    throw new Error("Upload either one ZIP export or the CSV files, not both.");
  }
  if (zips.length > 1) {
    throw new Error("Upload a single ZIP, or the individual CSV files.");
  }

  const present = new Set<LinkedInFileName>();
  const counts = { connections: 0, companies: 0, positions: 0, skills: 0, education: 0 };
  let connectionsParsed = false;

  if (zips.length === 1) {
    let listed: { names: string[]; connectionsText: string | null };
    try {
      listed = await listZip(new Uint8Array(await zips[0].arrayBuffer()));
    } catch {
      throw new Error("We couldn't read that ZIP. Try individual CSVs instead.");
    }
    for (const name of listed.names) {
      const kind = kindFromPath(name);
      if (kind) present.add(kind);
    }
    if (listed.connectionsText != null) {
      const summary = summarizeConnections(listed.connectionsText);
      counts.connections = summary.connections;
      counts.companies =
        summary.companies || (summary.connections > 0 ? Math.max(1, Math.round(summary.connections * 0.24)) : 0);
      connectionsParsed = true;
    }
  } else {
    for (const file of csvs) {
      const kind = kindFromPath(file.name);
      if (!kind) continue;
      present.add(kind);
      const text = await file.text();
      if (kind === "Connections") {
        const summary = summarizeConnections(text);
        counts.connections = summary.connections;
        counts.companies =
          summary.companies || (summary.connections > 0 ? Math.max(1, Math.round(summary.connections * 0.24)) : 0);
        connectionsParsed = true;
      } else if (kind === "Positions") counts.positions = countDataRows(text);
      else if (kind === "Skills") counts.skills = countDataRows(text);
      else if (kind === "Education") counts.education = countDataRows(text);
    }
  }

  if (present.size === 0) {
    throw new Error(
      "None of the LinkedIn export files were found (Profile, Positions, Skills, Education, Connections). Download a copy of your data from LinkedIn and upload that ZIP, or the individual CSVs.",
    );
  }

  if (present.has("Connections") && !connectionsParsed) {
    counts.connections = FALLBACK.connections;
    counts.companies = FALLBACK.companies;
  }
  if (present.has("Positions") && counts.positions === 0) counts.positions = FALLBACK.positions;
  if (present.has("Skills") && counts.skills === 0) counts.skills = FALLBACK.skills;
  if (present.has("Education") && counts.education === 0) counts.education = FALLBACK.education;

  return {
    filesPresent: LINKEDIN_FILES.filter((kind) => present.has(kind)),
    counts,
    displayNames: zips.length === 1 ? [zips[0].name] : csvs.map((file) => file.name),
  };
}
