import "server-only";

import { collectReviewFiles, type ReviewFile } from "@/lib/github/collect-review";
import type { GithubProject } from "@/lib/github/public-projects";
import { requestRepoScores, repoReviewModel } from "@/lib/ai/repo/gpt";
import { rollupTopicScores, type GithubReview } from "@/lib/ai/repo/topics";

export type { GithubReview };

export async function reviewPublicGithub(
  login: string,
  projects: GithubProject[],
  fetchImpl: typeof fetch = fetch,
): Promise<GithubReview | null> {
  const files = await collectReviewFiles(login, projects, fetchImpl);
  if (files.length === 0) return null;
  const subtopics = await requestRepoScores(formatEvidence(login, files));
  const rolled = rollupTopicScores(subtopics);
  return {
    status: "succeeded",
    login,
    repos: [...new Set(files.map((file) => file.repo))],
    filesReviewed: files.length,
    model: repoReviewModel(),
    overall: rolled.overall,
    topics: rolled.topics,
  };
}

function formatEvidence(login: string, files: ReviewFile[]): string {
  const header = `GitHub login: ${login}\nRepositories in this sample: ${[...new Set(files.map((file) => file.repo))].join(", ")}`;
  const blocks = files.map(
    (file) => `<file repo="${file.repo}" path="${file.path}">\n${file.text.replaceAll("<", "‹")}\n</file>`,
  );
  return [header, ...blocks].join("\n\n");
}
