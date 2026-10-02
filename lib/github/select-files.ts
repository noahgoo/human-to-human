export type TreeEntry = {
  path: string;
  type?: string;
  size?: number;
};

const SKIP_PREFIXES = [
  "node_modules/",
  "vendor/",
  "third_party/",
  "dist/",
  "build/",
  "out/",
  ".next/",
  "coverage/",
  "__pycache__/",
  ".git/",
  "Pods/",
  ".venv/",
  "venv/",
  "target/",
];

const SKIP_NAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "cargo.lock",
  "go.sum",
  "composer.lock",
  "bun.lock",
]);

const SOURCE = /\.(ts|tsx|js|jsx|py|go|rs|java|rb|sql|yml|yaml|md|tf|toml|json|gradle)$/i;

export function selectReviewFiles(entries: TreeEntry[], limit = 36): string[] {
  return entries
    .filter((entry) => entry.type !== "tree" && entry.path && !skip(entry))
    .map((entry) => ({ path: entry.path, priority: priority(entry.path) }))
    .filter((entry) => entry.priority < 9)
    .sort((a, b) => a.priority - b.priority || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map((entry) => entry.path);
}

function skip(entry: TreeEntry): boolean {
  const path = entry.path.replace(/\\/g, "/");
  if (path.startsWith("/") || path.includes("..")) return true;
  const lower = path.toLowerCase();
  if (SKIP_PREFIXES.some((prefix) => lower.includes(prefix))) return true;
  const base = lower.split("/").pop() ?? lower;
  if (SKIP_NAMES.has(base)) return true;
  if ((entry.size ?? 0) > 100_000) return true;
  return false;
}

const CODE = /\.(ts|tsx|js|jsx|py|go|rs|java|rb|sql)$/i;

function priority(path: string): number {
  const lower = path.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  if (isTest(lower, base)) return 0;
  if (CODE.test(base)) return 1;
  if (
    lower.includes(".github/workflows/") ||
    base.startsWith("dockerfile") ||
    base.includes("docker-compose") ||
    base.endsWith(".tf") ||
    lower.includes("prometheus") ||
    lower.includes("grafana")
  ) {
    return 2;
  }
  if (
    ["package.json", "pyproject.toml", "go.mod", "cargo.toml", "pom.xml", "build.gradle", "requirements.txt", "gemfile"].includes(base)
  ) {
    return 3;
  }
  if (base.startsWith("readme")) return 4;
  if (lower.startsWith("docs/") || lower.includes("/adr") || base.startsWith("adr-") || base === "contributing.md") return 5;
  if (SOURCE.test(base)) return 6;
  return 9;
}

function isTest(lower: string, base: string): boolean {
  return /(^|\/)(test|tests|__tests__|spec)\//.test(lower) || /\.(test|spec)\./.test(base) || base.startsWith("test_");
}
