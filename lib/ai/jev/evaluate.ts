import "server-only";

import { GptError } from "@/lib/ai/repo/gpt";
import { collectRepoSample, reviewPublicGithub, scoreRepoSample, type GithubReview } from "@/lib/ai/repo/review";
import { extractGithubLogin, loadPublicProjects, projectsEvidenceText, type LoadedRepo } from "@/lib/github/public-projects";
import { FIT_AGENTS, jevCompareCalls, type FitAgent, type FitSource, AGENT_SOURCES } from "@/lib/ai/jev/agents";
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
  /** Public repository from the apply form. When set, this repo is the GitHub evidence and the review target. */
  submittedRepo?: LoadedRepo | null;
  fetchImpl?: typeof fetch;
};

export type GithubReviewOutcome = GithubReview | { status: "failed"; message: string } | null;

export type CandidateEvaluation = FitPreview & {
  githubReview: GithubReviewOutcome;
};

/** Jev scores for resume, LinkedIn profile, and rich media. No GitHub and no connections. */
export async function compareResumeProfileRichMedia(input: {
  jobTitle: string;
  jobRequirements: string;
  profileCsv: string;
  richMediaCsv: string;
  resumeText?: string;
}): Promise<FitPreview> {
  const profile = profileEvidenceText(parseProfileCsv(input.profileCsv));
  const richMedia = richMediaEvidenceText(parseRichMediaCsv(input.richMediaCsv));
  const resume = input.resumeText ? prepareResumeText(input.resumeText) : "";
  const calls = jevCompareCalls({ richMedia, profile, resume });
  if (calls.length === 0) {
    throw new CsvParseError("Not enough resume, profile, or rich media evidence to score.");
  }

  const parts = await Promise.all(
    calls.map(async (call) => ({
      agent: call.agent,
      source: call.source,
      distribution: await scoreEvidence({
        agent: call.agent,
        source: call.source,
        jobTitle: input.jobTitle,
        jobRequirements: input.jobRequirements,
        evidence: call.text,
      }),
    })),
  );

  try {
    return aggregateFit(parts);
  } catch (error) {
    throw new CsvParseError(error instanceof Error ? error.message : "Not enough evidence to score.");
  }
}

function scoreParts(
  input: EvaluateInput,
  evidence: Record<FitSource, string>,
): Promise<Array<{ agent: FitAgent; source: FitSource; distribution: number[] }>> {
  const calls = FIT_AGENTS.flatMap((agent) =>
    AGENT_SOURCES[agent]
      .map((source) => ({ agent, source, text: evidence[source] }))
      .filter((call) => call.text.trim().length > 0),
  );
  return Promise.all(
    calls.map(async (call) => ({
      agent: call.agent,
      source: call.source,
      distribution: await scoreEvidence({
        agent: call.agent,
        source: call.source,
        jobTitle: input.jobTitle,
        jobRequirements: input.jobRequirements,
        evidence: call.text,
      }),
    })),
  );
}

export async function evaluateCandidate(input: EvaluateInput): Promise<CandidateEvaluation> {
  const profile = parseProfileCsv(input.profileCsv);
  const richMedia = richMediaEvidenceText(parseRichMediaCsv(input.richMediaCsv));
  parseConnectionsCsv(input.connectionsCsv);

  const profileText = profileEvidenceText(profile);
  const resume = input.resumeText ? prepareResumeText(input.resumeText) : "";
  const submitted = input.submittedRepo ?? null;

  let github = "";
  let githubReview: GithubReviewOutcome = null;
  if (submitted) {
    let sample: { evidence: string; files: Parameters<typeof scoreRepoSample>[1] } = {
      evidence: projectsEvidenceText([submitted.project]),
      files: [],
    };
    try {
      sample = await collectRepoSample(submitted.owner, [submitted.project], input.fetchImpl);
    } catch {
      githubReview = { status: "failed", message: "GitHub review failed." };
    }
    github = sample.evidence;
    const reviewPromise =
      githubReview?.status === "failed"
        ? Promise.resolve(githubReview)
        : sample.files.length === 0
          ? Promise.resolve({ status: "failed" as const, message: "No reviewable source files in that repository." })
          : scoreRepoSample(submitted.owner, sample.files).catch((error: unknown) => {
              if (error instanceof GptError && error.code === "missing_key") throw error;
              return { status: "failed" as const, message: "GPT could not review the GitHub repository." };
            });
    const [parts, review] = await Promise.all([
      scoreParts(input, { richMedia, profile: profileText, github, resume }),
      reviewPromise,
    ]);
    try {
      return { ...aggregateFit(parts), githubReview: review };
    } catch (error) {
      throw new CsvParseError(error instanceof Error ? error.message : "Not enough evidence to score.");
    }
  }

  const login = extractGithubLogin(profile.githubSearchText);
  const projects = login ? await loadPublicProjects(login, input.fetchImpl).catch(() => []) : [];
  github = projectsEvidenceText(projects);

  const [parts, profileReview] = await Promise.all([
    scoreParts(input, { richMedia, profile: profileText, github, resume }),
    login && githubGptReviewEnabled()
      ? loadGithubReview(login, projects, input.fetchImpl)
      : Promise.resolve(null),
  ]);
  githubReview = profileReview;

  try {
    return { ...aggregateFit(parts), githubReview };
  } catch (error) {
    throw new CsvParseError(error instanceof Error ? error.message : "Not enough evidence to score.");
  }
}
