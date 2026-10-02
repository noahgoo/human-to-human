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

export async function loadPublicProjects(
  login: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubProject[]> {
  const response = await fetchImpl(
    `https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=100&sort=updated&type=owner`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "nexuspulse-fit",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) return [];
  const body: unknown = await response.json();
  if (!Array.isArray(body)) return [];
  return body
    .filter((repo): repo is GithubRepo => typeof repo === "object" && repo !== null)
    .filter((repo) => repo.private !== true && repo.fork !== true && typeof repo.name === "string")
    .map((repo) => ({
      name: repo.name as string,
      description: repo.description?.slice(0, 300) ?? null,
      language: repo.language ?? null,
      topics: (repo.topics ?? []).slice(0, 8),
      stars: repo.stargazers_count ?? 0,
      defaultBranch: repo.default_branch,
      pushedAt: repo.pushed_at,
    }))
    .sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name))
    .slice(0, 30);
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
