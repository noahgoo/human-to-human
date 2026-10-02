import { errorMessage } from "@/lib/copy";
import { createApplication } from "@/lib/data/apply";
import { requireApplicant } from "@/lib/data/jobs";

export const runtime = "nodejs";
export const maxDuration = 120;

function apiError(status: number, code: string, message?: string) {
  return Response.json({ error: { code, message: message ?? errorMessage(code) } }, { status });
}

export async function POST(request: Request) {
  const auth = await requireApplicant();
  if (!auth.ok) return apiError(auth.status, auth.code);

  let body: {
    jobId?: unknown;
    githubRepoUrl?: unknown;
    expectedTokenCost?: unknown;
    repoOwnershipAttested?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError(422, "VALIDATION_FAILED", "Request body must be JSON.");
  }

  if (typeof body.jobId !== "string" || !body.jobId) {
    return apiError(422, "VALIDATION_FAILED", "jobId is required.");
  }
  if (typeof body.expectedTokenCost !== "number" || !Number.isFinite(body.expectedTokenCost)) {
    return apiError(422, "VALIDATION_FAILED", "expectedTokenCost is required.");
  }

  const result = await createApplication({
    applicantId: auth.session.userId,
    jobId: body.jobId,
    githubRepoUrl: typeof body.githubRepoUrl === "string" ? body.githubRepoUrl : null,
    expectedTokenCost: body.expectedTokenCost,
    idempotencyKey: request.headers.get("idempotency-key"),
    repoOwnershipAttested: body.repoOwnershipAttested === true,
  });

  if (!result.ok) return apiError(result.status, result.error.code, result.error.message);
  return Response.json(result.body, { status: 201 });
}
