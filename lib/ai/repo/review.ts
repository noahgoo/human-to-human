import "server-only";

import { collectReviewFiles, type ReviewFile } from "@/lib/github/collect-review";
import { projectsEvidenceText, type GithubProject } from "@/lib/github/public-projects";
import { requestRepoScores, repoReviewModel } from "@/lib/ai/repo/gpt";
import { rollupTopicScores, type GithubReview } from "@/lib/ai/repo/topics";

export type { GithubReview };

export type RepoSample = {
  evidence: string;
  files: ReviewFile[];
};

export async function reviewPublicGithub(
  login: string,
  projects: GithubProject[],
  fetchImpl: typeof fetch = fetch,
): Promise<GithubReview | null> {
  const sample = await collectRepoSample(login, projects, fetchImpl);
  if (sample.files.length === 0) return null;
  return scoreRepoSample(login, sample.files);
}

/** File sample for one repository. Evidence is the project blurb when no source files are readable. */
export async function collectRepoSample(
  login: string,
  projects: GithubProject[],
  fetchImpl: typeof fetch = fetch,
): Promise<RepoSample> {
  const files = await collectReviewFiles(login, projects, fetchImpl);
  const summary = projectsEvidenceText(projects);
  const evidence = files.length > 0 ? [summary, formatEvidence(login, files)].filter(Boolean).join("\n\n").slice(0, 20_000) : summary;
  return { evidence, files };
}

export async function scoreRepoSample(login: string, files: ReviewFile[]): Promise<GithubReview> {
  const answer = await requestRepoScores(formatEvidence(login, files));
  const rolled = rollupTopicScores(answer.subtopics);
  return {
    status: "succeeded",
    login,
    repos: [...new Set(files.map((file) => file.repo))],
    filesReviewed: files.length,
    model: repoReviewModel(),
    overall: rolled.overall,
    topics: rolled.topics,
    gaps: answer.gaps.trim().slice(0, 700),
  };
}

function formatEvidence(login: string, files: ReviewFile[]): string {
  const header = `GitHub login: ${login}\nRepositories in this sample: ${[...new Set(files.map((file) => file.repo))].join(", ")}`;
  const blocks = files.map(
    (file) => `<file repo="${file.repo}" path="${file.path}">\n${file.text.replaceAll("<", "‹")}\n</file>`,
  );
  return [header, ...blocks].join("\n\n");
}
