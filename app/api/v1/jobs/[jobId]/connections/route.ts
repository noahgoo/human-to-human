import { errorMessage } from "@/lib/copy";
import { connectionsAtCompany } from "@/lib/data/fit";
import { getJobForApplicant, requireApplicant } from "@/lib/data/jobs";

function apiError(status: number, code: string) {
  return Response.json({ error: { code, message: errorMessage(code) } }, { status });
}

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const auth = await requireApplicant();
  if (!auth.ok) return apiError(auth.status, auth.code);

  const { jobId } = await context.params;
  const job = getJobForApplicant(jobId, auth.session.userId);
  if (!job) return apiError(404, "NOT_FOUND");

  const { data, total } = connectionsAtCompany(auth.session.userId, job.company.name);
  return Response.json({ data, total }, { headers: { "Cache-Control": "no-store" } });
}
