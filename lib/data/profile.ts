import "server-only";
import type { ApplicantProfile } from "@/lib/types";
import { db } from "@/lib/mock/db";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { resolveSupabaseApplicantId } from "@/lib/linkedin/resolve-applicant-id";
import { getLinkedInImportForApplicant } from "@/lib/data/linkedin-from-supabase";

export async function getApplicantProfile(userId: string): Promise<ApplicantProfile | null> {
  const mock = db().applicants.find((applicant) => applicant.id === userId) ?? null;
  if (!mock) return null;
  if (!isSupabaseConfigured()) return mock;
  try {
    const uuid = await resolveSupabaseApplicantId(mock.email);
    if (!uuid) return mock;
    const linkedin = await getLinkedInImportForApplicant(uuid);
    if (!linkedin) return mock;
    return { ...mock, linkedin };
  } catch {
    return mock;
  }
}
