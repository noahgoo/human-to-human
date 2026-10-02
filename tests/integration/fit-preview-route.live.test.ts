import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/api/v1/fit-evaluations/preview/route";
import {
  FIXTURE_CONNECTIONS_CSV,
  FIXTURE_JOB,
  FIXTURE_PROFILE_CSV,
  FIXTURE_RESUME,
  FIXTURE_RICH_MEDIA_CSV,
} from "../fixtures/linkedin-export";

const live = Boolean(process.env.OPENROUTER_API_KEY?.trim());
const secret = "vitest-preview-secret";

describe.skipIf(!live)("POST /api/v1/fit-evaluations/preview (live)", () => {
  const envBackup = {
    enabled: process.env.FIT_PREVIEW_ENABLED,
    secret: process.env.FIT_PREVIEW_SECRET,
    gpt: process.env.FIT_PREVIEW_GITHUB_GPT,
  };

  beforeAll(() => {
    process.env.FIT_PREVIEW_ENABLED = "true";
    process.env.FIT_PREVIEW_SECRET = secret;
    process.env.FIT_PREVIEW_GITHUB_GPT = "false";
  });

  afterAll(() => {
    process.env.FIT_PREVIEW_ENABLED = envBackup.enabled;
    process.env.FIT_PREVIEW_SECRET = envBackup.secret;
    process.env.FIT_PREVIEW_GITHUB_GPT = envBackup.gpt;
  });

  it("returns 401 without credentials", async () => {
    const form = new FormData();
    form.set("jobTitle", FIXTURE_JOB.jobTitle);
    form.set("jobRequirements", FIXTURE_JOB.jobRequirements);
    const response = await POST(new Request("http://localhost/api/v1/fit-evaluations/preview", { method: "POST", body: form }));
    expect(response.status).toBe(401);
  });

  it(
    "returns confidence scores when authorized with the preview secret",
    async () => {
      const form = new FormData();
      form.set("jobTitle", FIXTURE_JOB.jobTitle);
      form.set("jobRequirements", FIXTURE_JOB.jobRequirements);
      form.set("profile", new File([FIXTURE_PROFILE_CSV], "Profile.csv", { type: "text/csv" }));
      form.set("richMedia", new File([FIXTURE_RICH_MEDIA_CSV], "Rich_Media.csv", { type: "text/csv" }));
      form.set("connections", new File([FIXTURE_CONNECTIONS_CSV], "Connections.csv", { type: "text/csv" }));
      form.set("resumeText", FIXTURE_RESUME);

      const response = await POST(
        new Request("http://localhost/api/v1/fit-evaluations/preview", {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}` },
          body: form,
        }),
      );

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        confidenceScore: expect.any(Number),
        band: expect.stringMatching(/^(strong|good|moderate|limited)$/),
      });
    },
    180_000,
  );
});
