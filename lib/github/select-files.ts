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
const IMPORTANT_ROOTS = new Set(["app", "src", "supabase", "lib", "client", "server", "shared"]);
const SKIP_ROOTS = new Set(["starter-code", "design", "public", ".idea"]);

/** Prefer code in app, src, supabase, lib, and chess modules. README fills a leftover slot. */
export function selectReviewFiles(entries: TreeEntry[], limit = 12): string[] {
  const files = entries.filter((entry) => entry.type !== "tree" && entry.path && !skip(entry) && reviewable(entry.path));
  const readme = files.find((entry) => isReadme(entry.path));
  const ranked = files
    .filter((entry) => entry !== readme)
    .sort((a, b) => priority(a.path) - priority(b.path) || a.path.localeCompare(b.path));

  const groups = new Map<string, string[]>();
  const other: string[] = [];
  for (const entry of ranked) {
    const root = rootOf(entry.path);
    if (IMPORTANT_ROOTS.has(root)) {
      const queue = groups.get(root) ?? [];
      queue.push(entry.path);
      groups.set(root, queue);
    } else {
      other.push(entry.path);
    }
  }

  const picked: string[] = [];
  const codeLimit = readme ? Math.max(limit - 1, 0) : limit;
  const queues = [...groups.values()];
  let progressed = true;
  while (picked.length < codeLimit && progressed) {
    progressed = false;
    for (const queue of queues) {
      if (picked.length >= codeLimit) break;
      const next = queue.shift();
      if (!next) continue;
      picked.push(next);
      progressed = true;
    }
  }

  for (const path of other) {
    if (picked.length >= codeLimit) break;
    picked.push(path);
  }
  if (readme && picked.length < limit) picked.push(readme.path);
  return picked;
}

function skip(entry: TreeEntry): boolean {
  const path = entry.path.replace(/\\/g, "/");
  if (path.startsWith("/") || path.includes("..")) return true;
  const lower = path.toLowerCase();
  if (SKIP_PREFIXES.some((prefix) => lower.includes(prefix))) return true;
  if (SKIP_ROOTS.has(rootOf(lower))) return true;
  const base = lower.split("/").pop() ?? lower;
  if (SKIP_NAMES.has(base)) return true;
  if ((entry.size ?? 0) > 100_000) return true;
  return false;
}

const CODE = /\.(ts|tsx|js|jsx|py|go|rs|java|rb|sql)$/i;

function rootOf(path: string): string {
  return path.split("/")[0]?.toLowerCase() ?? "";
}

function isReadme(path: string): boolean {
  const base = path.toLowerCase().split("/").pop() ?? "";
  return base.startsWith("readme");
}

function reviewable(path: string): boolean {
  const base = path.toLowerCase().split("/").pop() ?? "";
  return isReadme(path) || CODE.test(base) || SOURCE.test(base);
}

function priority(path: string): number {
  const lower = path.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  if (CODE.test(base) && !isTest(lower, base)) return 0;
  if (isTest(lower, base)) return 1;
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
