const SUFFIX =
  /^(.*)\s(inc|incorporated|llc|llp|lp|ltd|limited|corp|corporation|co|company|plc|gmbh|group|holdings)$/;

/** Same shape as public.normalize_company_name for matching connection employers. */
export function normalizeCompanyName(name: string): string | null {
  let value = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.(com|io|ai|co|net|org)\b/g, "")
    .replace(/&/g, " and ")
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the\s/, "");
  if (!value) return null;
  let previous = "";
  while (value !== previous) {
    previous = value;
    value = value.replace(SUFFIX, "$1").trim();
  }
  if (
    [
      "self employed",
      "self",
      "freelance",
      "freelancer",
      "stealth",
      "retired",
      "unemployed",
      "confidential",
      "none",
      "student",
    ].includes(value)
  ) {
    return null;
  }
  return value || null;
}
