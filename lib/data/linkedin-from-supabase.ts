import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { LinkedInImportInfo } from "@/lib/types";
import { ONBOARDING_LINKEDIN_FILES, type OnboardingLinkedInFile } from "@/lib/linkedin/onboarding-files";

function fileKindFromCsvName(name: string): OnboardingLinkedInFile | null {
  const stem = name.replace(/\.csv$/i, "");
  return ONBOARDING_LINKEDIN_FILES.find((k) => k.toLowerCase() === stem.toLowerCase()) ?? null;
}

function rowToInfo(row: Record<string, unknown>): LinkedInImportInfo {
  const countsRaw = (row.counts ?? {}) as Record<string, number>;
  const present = ((row.files_present ?? []) as string[])
    .map(fileKindFromCsvName)
    .filter(Boolean) as LinkedInImportInfo["filesPresent"];
  return {
    id: String(row.id),
    status: row.status as LinkedInImportInfo["status"],
    filesPresent: present.length > 0 ? present : [...ONBOARDING_LINKEDIN_FILES],
    counts: {
      connections: Number(countsRaw.connections ?? 0),
      companies: Number(countsRaw.companies ?? 0),
      positions: Number(countsRaw.positions ?? 0),
      skills: Number(countsRaw.skills ?? 0),
      education: Number(countsRaw.education ?? 0),
      richMedia: Number(countsRaw.richMedia ?? countsRaw.rich_media ?? 0),
    },
  };
}

export async function getLinkedInImportForApplicant(applicantUuid: string): Promise<LinkedInImportInfo | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("applicant_profiles")
    .select("active_linkedin_import_id")
    .eq("profile_id", applicantUuid)
    .maybeSingle();
  const importId = profile?.active_linkedin_import_id;
  if (!importId) {
    const { data: latest } = await admin
      .from("linkedin_imports")
      .select("*")
      .eq("applicant_id", applicantUuid)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return latest ? rowToInfo(latest) : null;
  }
  const { data: row } = await admin.from("linkedin_imports").select("*").eq("id", importId).maybeSingle();
  return row ? rowToInfo(row) : null;
}
