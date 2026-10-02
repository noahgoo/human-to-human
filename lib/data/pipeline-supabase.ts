import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Future: load applications, fit_evaluations, and repo_evaluations from Supabase
 * using the same joins as lib/data/pipeline.ts buildRows:
 *   applications.job_id = job.id
 *   fit_evaluations.id = applications.fit_evaluation_id
 *   repo_evaluations.application_id = applications.id
 *
 * When implemented, loadApplicantsPage should prefer this source when configured,
 * then fall back to lib/mock/db.ts for local demo.
 */
export function pipelineUsesSupabase(): boolean {
  return isSupabaseConfigured() && process.env.PIPELINE_SUPABASE === "1";
}

export async function loadPipelineRowsFromSupabase(_jobId: string, _companyId: string): Promise<null> {
  if (!pipelineUsesSupabase()) return null;
  // Not wired yet — mock store remains the source of truth for recruiter pipeline.
  return null;
}
