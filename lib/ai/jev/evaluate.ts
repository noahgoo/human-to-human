import "server-only";

import { GptError } from "@/lib/ai/repo/gpt";
import { reviewPublicGithub, type GithubReview } from "@/lib/ai/repo/review";
import { extractGithubLogin, loadPublicProjects, projectsEvidenceText } from "@/lib/github/public-projects";
import { AGENT_SOURCES, FIT_AGENTS, type FitAgent, type FitSource } from "@/lib/ai/jev/agents";
import { prepareResumeText } from "@/lib/parsers/resume/prepare";
import { scoreEvidence } from "@/lib/ai/jev/client";
import { aggregateFit, type FitPreview } from "@/lib/ai/jev/score";
import {
  CsvParseError,
  parseConnectionsCsv,
  parseProfileCsv,
  parseRichMediaCsv,
  profileEvidenceText,
  richMediaEvidenceText,
} from "@/lib/parsers/linkedin/fit-sources";

export { CsvParseError };

import { githubGptReviewEnabled } from "@/lib/api/preview-config";

async function loadGithubReview(
  login: string,
  projects: Parameters<typeof reviewPublicGithub>[1],
  fetchImpl: typeof fetch | undefined,
): Promise<GithubReviewOutcome> {
  try {
    return await reviewPublicGithub(login, projects, fetchImpl);
  } catch (error) {
    if (error instanceof GptError && error.code === "missing_key") throw error;
    const message = error instanceof GptError ? "GPT could not review the GitHub repositories." : "GitHub review failed.";
    return { status: "failed", message };
  }
}

export type EvaluateInput = {
  jobTitle: string;
  jobRequirements: string;
  profileCsv: string;
  richMediaCsv: string;
  connectionsCsv: string;
  resumeText?: string;
  fetchImpl?: typeof fetch;
};

export type GithubReviewOutcome = GithubReview | { status: "failed"; message: string } | null;

export type CandidateEvaluation = FitPreview & {
  githubReview: GithubReviewOutcome;
};

export async function evaluateCandidate(input: EvaluateInput): Promise<CandidateEvaluation> {
  const profile = parseProfileCsv(input.profileCsv);
  const richMedia = richMediaEvidenceText(parseRichMediaCsv(input.richMediaCsv));
  parseConnectionsCsv(input.connectionsCsv);

  const login = extractGithubLogin(profile.githubSearchText);
  const projects = login ? await loadPublicProjects(login, input.fetchImpl).catch(() => []) : [];
  const github = projectsEvidenceText(projects);
  const profileText = profileEvidenceText(profile);

  const resume = input.resumeText ? prepareResumeText(input.resumeText) : "";

  const evidence: Record<FitSource, string> = {
    richMedia,
    profile: profileText,
    github,
    resume,
  };

  const calls = FIT_AGENTS.flatMap((agent) =>
    AGENT_SOURCES[agent]
      .map((source) => ({ agent, source, text: evidence[source] }))
      .filter((call) => call.text.trim().length > 0),
  );

  const [parts, githubReview] = await Promise.all([
    Promise.all(
      calls.map(async (call) => ({
        agent: call.agent as FitAgent,
        source: call.source,
        distribution: await scoreEvidence({
          agent: call.agent,
          source: call.source,
          jobTitle: input.jobTitle,
          jobRequirements: input.jobRequirements,
          evidence: call.text,
        }),
      })),
    ),
    login && githubGptReviewEnabled()
      ? loadGithubReview(login, projects, input.fetchImpl)
      : Promise.resolve(null),
  ]);

  try {
    return { ...aggregateFit(parts), githubReview };
  } catch (error) {
    throw new CsvParseError(error instanceof Error ? error.message : "Not enough evidence to score.");
  }
}
