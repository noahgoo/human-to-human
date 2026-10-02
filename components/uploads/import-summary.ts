export function formatImportCounts(counts: {
  connections: number;
  companies: number;
  positions: number;
  skills?: number;
  education?: number;
  richMedia?: number;
}): string {
  const n = (value: number) => value.toLocaleString("en-US");
  const parts = [
    `${n(counts.connections)} connections across ${n(counts.companies)} companies`,
    `${n(counts.positions)} positions`,
  ];
  if (counts.richMedia != null && counts.richMedia > 0) {
    parts.push(`${n(counts.richMedia)} rich media items`);
  }
  if (counts.skills != null && counts.skills > 0) {
    parts.push(`${n(counts.skills)} skills`);
  }
  if (counts.education != null && counts.education > 0) {
    parts.push(`${n(counts.education)} education`);
  }
  return parts.join(" · ");
}

type LinkedInKind = "Profile" | "Positions" | "Skills" | "Education" | "Connections" | "Rich_Media";

function labeled(value: number, singular: string, plural = `${singular}s`): string {
  return `${value.toLocaleString("en-US")} ${value === 1 ? singular : plural}`;
}

/** Count line for one export file. Profile has no row count. */
export function formatFileCount(
  kind: LinkedInKind,
  counts: {
    connections: number;
    companies: number;
    positions: number;
    skills?: number;
    education?: number;
    richMedia?: number;
  },
): string | undefined {
  if (kind === "Connections") {
    return `${labeled(counts.connections, "connection")} across ${labeled(counts.companies, "company", "companies")}`;
  }
  if (kind === "Positions") return labeled(counts.positions, "position");
  if (kind === "Skills" && counts.skills != null) return labeled(counts.skills, "skill");
  if (kind === "Education" && counts.education != null) {
    return labeled(counts.education, "education entry", "education entries");
  }
  if (kind === "Rich_Media" && counts.richMedia != null) return labeled(counts.richMedia, "rich media item");
  return undefined;
}
