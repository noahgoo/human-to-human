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
