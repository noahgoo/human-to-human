/** Vercel serverless body limit (D-27). Three CSVs must stay under this combined. */
export const PREVIEW_MAX_FILE_BYTES = 1_400_000;

export function previewEnabled(): boolean {
  return process.env.FIT_PREVIEW_ENABLED === "true";
}

export function githubGptReviewEnabled(): boolean {
  return process.env.FIT_PREVIEW_GITHUB_GPT === "true";
}
