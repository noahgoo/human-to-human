import { errorMessage } from "@/lib/copy";
import { getFitForApplicant, toFitDto } from "@/lib/data/fit";
import { requireApplicant } from "@/lib/data/jobs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApplicant();
  if (!auth.ok) {
    return Response.json({ error: { code: auth.code, message: errorMessage(auth.code) } }, { status: auth.status });
  }

  const { id } = await context.params;
  const fit = getFitForApplicant(id, auth.session.userId);
  if (!fit) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: errorMessage("NOT_FOUND") } },
      { status: 404 },
    );
  }

  return Response.json(toFitDto(fit), { headers: { "Cache-Control": "no-store" } });
}
