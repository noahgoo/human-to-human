import type { GithubProject } from "@/lib/github/public-projects";
import { selectReviewFiles, type TreeEntry } from "@/lib/github/select-files";

export type ReviewFile = {
  repo: string;
  path: string;
  text: string;
};

const FILE_CHARS = 6_000;
const TOTAL_CHARS = 40_000;
const REPO_LIMIT = 2;
const MAX_FILES = 15;

export async function collectReviewFiles(
  login: string,
  projects: GithubProject[],
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewFile[]> {
  const repos = [...projects]
    .sort((a, b) => Date.parse(b.pushedAt ?? "") - Date.parse(a.pushedAt ?? "") || a.name.localeCompare(b.name))
    .slice(0, REPO_LIMIT);

  const selected: Array<{ repo: string; path: string; branch: string }> = [];
  for (const project of repos) {
    if (selected.length >= MAX_FILES) break;
    const tree = await fetchTree(login, project, fetchImpl);
    for (const path of selectReviewFiles(tree, 12)) {
      if (selected.length >= MAX_FILES) break;
      selected.push({ repo: project.name, path, branch: project.defaultBranch ?? "HEAD" });
    }
  }

  const files: ReviewFile[] = [];
  let used = 0;
  for (const file of selected) {
    if (used >= TOTAL_CHARS) break;
    const raw = await fetchFile(login, file.repo, file.path, file.branch, fetchImpl);
    if (!raw) continue;
    const text = redactSecrets(raw).slice(0, FILE_CHARS);
    if (!text.trim()) continue;
    used += text.length;
    files.push({ repo: file.repo, path: file.path, text });
  }
  return files;
}

export function redactSecrets(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED]")
    .replace(/((?:api[_-]?key|secret|password|token)\s*[:=]\s*)['"][^'"]{8,}['"]/gi, "$1[REDACTED]");
}

async function fetchTree(login: string, project: GithubProject, fetchImpl: typeof fetch): Promise<TreeEntry[]> {
  const branch = project.defaultBranch ?? "HEAD";
  const response = await fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(login)}/${encodeURIComponent(project.name)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: githubHeaders(), signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) return [];
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("tree" in body) || !Array.isArray(body.tree)) return [];
  return body.tree.filter((entry): entry is TreeEntry => typeof entry === "object" && entry !== null && "path" in entry);
}

async function fetchFile(
  login: string,
  repo: string,
  path: string,
  branch: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const response = await fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(login)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`,
    { headers: { ...githubHeaders(), Accept: "application/vnd.github.raw" }, signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) return null;
  const text = await response.text();
  if (text.includes("\u0000")) return null;
  return text;
}

function githubHeaders(): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "known-fit",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}
