const LOGIN = /github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)/gi;

const RESERVED = new Set([
  "about",
  "account",
  "apps",
  "codespaces",
  "collections",
  "events",
  "explore",
  "features",
  "issues",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "pricing",
  "pulls",
  "settings",
  "signup",
  "sponsors",
  "topics",
]);

export type GithubProject = {
  name: string;
  description: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  defaultBranch?: string;
  pushedAt?: string;
};

type GithubRepo = {
  name?: string;
  description?: string | null;
  language?: string | null;
  topics?: string[];
  stargazers_count?: number;
  fork?: boolean;
  private?: boolean;
  default_branch?: string;
  pushed_at?: string;
};

export function extractGithubLogin(text: string): string | null {
  for (const match of text.matchAll(LOGIN)) {
    const login = match[1];
    if (!login || RESERVED.has(login.toLowerCase())) continue;
    return login;
  }
  return null;
}

export type LoadedRepo = {
  owner: string;
  name: string;
  fullName: string;
  project: GithubProject;
  commitSha: string | null;
  isFork: boolean;
};

type RepoPayload = GithubRepo & {
  full_name?: string;
};

/** Public repository metadata, or null when the repo is missing or private. */
export async function loadPublicRepo(
  owner: string,
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LoadedRepo | null> {
  const response = await fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    { headers: githubHeaders(), signal: AbortSignal.timeout(8_000) },
  );
  if (response.status === 404 || response.status === 451) return null;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const text = await response.text();
      if (/rate limit/i.test(text)) throw new Error("GITHUB_UNAVAILABLE");
      return null;
    }
    throw new Error("GITHUB_UNAVAILABLE");
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) return null;
  const repo = body as RepoPayload;
  if (repo.private === true || typeof repo.name !== "string") return null;
  const project = toProject(repo);
  const commitSha = await fetchCommitSha(owner, project.name, project.defaultBranch ?? "HEAD", fetchImpl);
  return {
    owner,
    name: project.name,
    fullName: repo.full_name ?? `${owner}/${project.name}`,
    project,
    commitSha,
    isFork: repo.fork === true,
  };
}

export async function loadPublicProjects(
  login: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubProject[]> {
  const response = await fetchImpl(
    `https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=100&sort=updated&type=owner`,
    { headers: githubHeaders(), signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) return [];
  const body: unknown = await response.json();
  if (!Array.isArray(body)) return [];
  return body
    .filter((repo): repo is GithubRepo => typeof repo === "object" && repo !== null)
    .filter((repo) => repo.private !== true && repo.fork !== true && typeof repo.name === "string")
    .map((repo) => toProject(repo))
    .sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name))
    .slice(0, 30);
}

function toProject(repo: GithubRepo): GithubProject {
  return {
    name: repo.name as string,
    description: repo.description?.slice(0, 300) ?? null,
    language: repo.language ?? null,
    topics: (repo.topics ?? []).slice(0, 8),
    stars: repo.stargazers_count ?? 0,
    defaultBranch: repo.default_branch,
    pushedAt: repo.pushed_at,
  };
}

async function fetchCommitSha(
  owner: string,
  name: string,
  branch: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(branch)}`,
      { headers: githubHeaders(), signal: AbortSignal.timeout(8_000) },
    );
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("sha" in body)) return null;
    return typeof body.sha === "string" ? body.sha : null;
  } catch {
    return null;
  }
}

function githubHeaders(): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "known-fit",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  };
}

export function projectsEvidenceText(projects: GithubProject[]): string {
  return projects
    .map((project) => {
      const language = project.language ? ` (${project.language})` : "";
      const topics = project.topics.length > 0 ? ` [${project.topics.join(", ")}]` : "";
      const description = project.description ? `: ${project.description}` : "";
      return `- ${project.name}${language} ★${project.stars}${description}${topics}`;
    })
    .join("\n")
    .slice(0, 20_000);
}
