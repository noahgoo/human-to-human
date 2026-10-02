import { errorMessage } from "@/lib/copy";
import { createPendingFit, freshSucceededFit, toFitDto } from "@/lib/data/fit";
import { getJobForApplicant, requireApplicant } from "@/lib/data/jobs";

function apiError(status: number, code: string, message?: string) {
  return Response.json({ error: { code, message: message ?? errorMessage(code) } }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const auth = await requireApplicant();
  if (!auth.ok) return apiError(auth.status, auth.code);

  const { jobId } = await context.params;
  const job = getJobForApplicant(jobId, auth.session.userId);
  if (!job || job.status !== "open") return apiError(404, "NOT_FOUND");

  let recheck = false;
  try {
    const body = (await request.json()) as { recheck?: boolean } | null;
    recheck = Boolean(body?.recheck);
  } catch {
    recheck = false;
  }

  if (!recheck) {
    const fresh = freshSucceededFit(jobId, auth.session.userId);
    if (fresh) return Response.json(toFitDto(fresh), { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  const fit = createPendingFit(jobId, auth.session.userId);
  return Response.json({ id: fit.id }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
