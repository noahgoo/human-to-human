import { JevError } from "@/lib/ai/jev/client";
import { CsvParseError } from "@/lib/ai/jev/evaluate";
import { errorMessage } from "@/lib/copy";
import { runJevFit, toFitDto } from "@/lib/data/fit";
import { getJobForApplicant, requireApplicant } from "@/lib/data/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

function apiError(status: number, code: string, message?: string) {
  return Response.json({ error: { code, message: message ?? errorMessage(code) } }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const auth = await requireApplicant();
  if (!auth.ok) return apiError(auth.status, auth.code);

  const { jobId } = await context.params;
  const job = await getJobForApplicant(jobId, auth.session.userId);
  if (!job || job.status !== "open") return apiError(404, "NOT_FOUND");

  let recheck = false;
  try {
    const body = (await request.json()) as { recheck?: boolean } | null;
    recheck = Boolean(body?.recheck);
  } catch {
    recheck = false;
  }

  try {
    const fit = await runJevFit(jobId, auth.session.userId, recheck);
    return Response.json(toFitDto(fit), { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof Error && err.message === "MISSING_EVIDENCE") {
      return apiError(422, "VALIDATION_FAILED", "A resume, LinkedIn profile, and rich media export are required.");
    }
    if (err instanceof CsvParseError) return apiError(422, "VALIDATION_FAILED", err.message);
    if (err instanceof JevError && err.code === "missing_key") {
      return apiError(503, "SERVICE_UNAVAILABLE", "OpenRouter is not configured.");
    }
    if (err instanceof JevError) return apiError(502, "OPENROUTER_UNAVAILABLE", "Jev could not score this candidate.");
    return apiError(500, "INTERNAL", "Could not check fit.");
  }
}
