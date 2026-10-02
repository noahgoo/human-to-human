import { describe, expect, it } from "vitest";
import { githubGptReviewEnabled, previewEnabled } from "@/lib/api/preview-config";

describe("preview config", () => {
  it("requires explicit env flags", () => {
    const prevPreview = process.env.FIT_PREVIEW_ENABLED;
    const prevGpt = process.env.FIT_PREVIEW_GITHUB_GPT;
    process.env.FIT_PREVIEW_ENABLED = "false";
    process.env.FIT_PREVIEW_GITHUB_GPT = "false";
    expect(previewEnabled()).toBe(false);
    expect(githubGptReviewEnabled()).toBe(false);
    process.env.FIT_PREVIEW_ENABLED = "true";
    process.env.FIT_PREVIEW_GITHUB_GPT = "true";
    expect(previewEnabled()).toBe(true);
    expect(githubGptReviewEnabled()).toBe(true);
    process.env.FIT_PREVIEW_ENABLED = prevPreview;
    process.env.FIT_PREVIEW_GITHUB_GPT = prevGpt;
  });
});
