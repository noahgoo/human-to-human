export function formatImportCounts(counts: {
  connections: number;
  companies: number;
  positions: number;
  skills: number;
  education: number;
}): string {
  const n = (value: number) => value.toLocaleString("en-US");
  return `${n(counts.connections)} connections across ${n(counts.companies)} companies · ${n(counts.positions)} positions · ${n(counts.skills)} skills · ${n(counts.education)} education`;
}
