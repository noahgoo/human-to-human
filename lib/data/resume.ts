import "server-only";
import { createHash } from "node:crypto";
import { admin } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { must } from "@/lib/db/rows";

const PLACEHOLDER = /^\[Extracted text from /;

export function usableResumeText(text: string | null | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed || PLACEHOLDER.test(trimmed)) return undefined;
  return trimmed;
}

/** Active resume text stored for this applicant. */
export async function loadStoredResumeText(applicantId: string): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined;
  const profile = must(
    await admin().from("applicant_profiles").select("active_resume_id").eq("profile_id", applicantId).maybeSingle(),
    "applicant_profiles",
  ) as { active_resume_id: string | null } | null;
  if (!profile?.active_resume_id) return undefined;
  const resume = must(
    await admin()
      .from("resumes")
      .select("text_content, parse_status")
      .eq("id", profile.active_resume_id)
      .maybeSingle(),
    "resumes",
  ) as { text_content: string | null; parse_status: string } | null;
  if (resume?.parse_status !== "succeeded") return undefined;
  return usableResumeText(resume.text_content);
}

export async function persistResume(input: {
  applicantId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  text: string;
}): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const ext = input.fileName.toLowerCase().endsWith(".docx") ? ".docx" : ".pdf";
  const db = admin();
  const { error } = await db.from("resumes").insert({
    id,
    applicant_id: input.applicantId,
    storage_path: `${input.applicantId}/${id}${ext}`,
    original_filename: input.fileName.slice(0, 255),
    mime_type: input.mimeType,
    size_bytes: input.bytes.byteLength,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
    text_content: input.text.slice(0, 100_000),
    parse_status: "succeeded",
  });
  if (error) throw new Error(`resumes: ${error.message}`);

  const updated = must(
    await db
      .from("applicant_profiles")
      .update({ active_resume_id: id })
      .eq("profile_id", input.applicantId)
      .select("profile_id"),
    "applicant_profiles",
  ) as Array<{ profile_id: string }>;
  if (updated.length === 0) {
    const { error: insertError } = await db.from("applicant_profiles").insert({
      profile_id: input.applicantId,
      active_resume_id: id,
    });
    if (insertError) throw new Error(`applicant_profiles: ${insertError.message}`);
  }
  return { id };
}

export async function clearStoredResume(applicantId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await admin()
    .from("applicant_profiles")
    .update({ active_resume_id: null })
    .eq("profile_id", applicantId);
  if (error) throw new Error(`applicant_profiles: ${error.message}`);
}
