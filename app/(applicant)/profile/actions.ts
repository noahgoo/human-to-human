"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { homeFor, requireUser } from "@/lib/auth/session";
import { errorMessage } from "@/lib/copy";
import { db, newId } from "@/lib/mock/db";
import type { ActionResult, ApplicantProfile, LinkedInImportInfo, ResumeInfo, WorkMode } from "@/lib/types";
import { preferencesSchema, toProfilePreferences, type PreferencesInput } from "@/components/onboarding/preferences";
import { extractResumeText, resumeMime } from "@/lib/parsers/resume/extract";
import { prepareResumeText } from "@/lib/parsers/resume/prepare";
import { clearStoredResume, persistResume } from "@/lib/data/resume";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const LINKEDIN_FILES = ["Profile", "Positions", "Skills", "Education", "Connections"] as const;
const RESUME_LIMIT = 5 * 1024 * 1024;

function revalidateProfile() {
  revalidatePath("/onboarding/applicant");
  revalidatePath("/profile");
  revalidatePath("/jobs");
}

async function requireApplicant() {
  const session = await requireUser();
  if (session.role !== "applicant") redirect(homeFor(session));
  return session;
}

function ensureApplicant(session: { userId: string; fullName: string; email: string; avatarUrl: string | null }): ApplicantProfile {
  const store = db();
  const existing = store.applicants.find((applicant) => applicant.id === session.userId);
  if (existing) return existing;
  const created: ApplicantProfile = {
    id: session.userId,
    fullName: session.fullName,
    email: session.email,
    avatarUrl: session.avatarUrl,
    headline: null,
    targetSeniority: null,
    locationPref: null,
    resume: null,
    linkedin: null,
  };
  store.applicants.push(created);
  return created;
}

function countOf(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(1_000_000, Math.round(value));
}

export async function saveLinkedInImport(input: {
  filesPresent: LinkedInImportInfo["filesPresent"];
  counts: LinkedInImportInfo["counts"];
}): Promise<ActionResult<LinkedInImportInfo>> {
  const session = await requireApplicant();
  const filesPresent = LINKEDIN_FILES.filter((name) => input.filesPresent?.includes(name));
  if (filesPresent.length === 0) {
    return {
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Upload at least one LinkedIn export file." },
    };
  }
  const profile = ensureApplicant(session);
  const info: LinkedInImportInfo = {
    id: newId("li"),
    status: "succeeded",
    filesPresent,
    counts: {
      connections: countOf(input.counts?.connections),
      companies: countOf(input.counts?.companies),
      positions: countOf(input.counts?.positions),
      skills: countOf(input.counts?.skills),
      education: countOf(input.counts?.education),
    },
  };
  profile.linkedin = info;
  revalidateProfile();
  return { ok: true, data: info };
}

export async function clearLinkedIn(): Promise<ActionResult<null>> {
  const session = await requireApplicant();
  const profile = db().applicants.find((applicant) => applicant.id === session.userId);
  if (profile) profile.linkedin = null;
  revalidateProfile();
  return { ok: true, data: null };
}

export async function saveResume(formData: FormData): Promise<ActionResult<ResumeInfo>> {
  const session = await requireApplicant();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: "Upload a PDF or DOCX resume." } };
  }
  const fileName = file.name.split(/[/\\]/).pop()?.trim().slice(0, 180) ?? "";
  const mimeType = resumeMime(fileName);
  if (!mimeType) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: "Upload a PDF or DOCX resume." } };
  }
  if (file.size <= 0 || file.size > RESUME_LIMIT) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: "Resume must be 5 MB or smaller." } };
  }
  if (fileName.toLowerCase().includes("corrupt")) {
    return {
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "We couldn't read this file. Try exporting it as PDF." },
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let extracted = "";
  try {
    extracted = prepareResumeText(await extractResumeText(fileName, bytes));
  } catch {
    extracted = "";
  }
  if (extracted.trim().length < 40) {
    return {
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "We couldn't read this file. Try exporting it as PDF." },
    };
  }

  const profile = ensureApplicant(session);
  let id = newId("resume");
  if (isSupabaseConfigured()) {
    try {
      const saved = await persistResume({
        applicantId: session.userId,
        fileName,
        mimeType,
        bytes,
        text: extracted,
      });
      id = saved.id;
    } catch {
      return { ok: false, error: { code: "INTERNAL", message: "We couldn't save that resume. Try again." } };
    }
  }

  const resume: ResumeInfo = {
    id,
    fileName,
    sizeBytes: bytes.byteLength,
    mimeType,
    parseStatus: "succeeded",
    textContent: extracted,
  };
  profile.resume = resume;
  revalidateProfile();
  return { ok: true, data: resume };
}

export async function clearResume(): Promise<ActionResult<null>> {
  const session = await requireApplicant();
  const profile = db().applicants.find((applicant) => applicant.id === session.userId);
  if (profile) profile.resume = null;
  if (isSupabaseConfigured()) {
    try {
      await clearStoredResume(session.userId);
    } catch {
      return { ok: false, error: { code: "INTERNAL", message: "We couldn't remove that resume. Try again." } };
    }
  }
  revalidateProfile();
  return { ok: true, data: null };
}

export async function savePreferences(input: {
  targetSeniority: string | null;
  locationPref: WorkMode | null;
}): Promise<ActionResult<{ targetSeniority: string | null; locationPref: WorkMode | null }>> {
  const session = await requireApplicant();
  const parsed = preferencesSchema.safeParse({
    targetSeniority: input.targetSeniority ?? "",
    locationPref: input.locationPref ?? "",
  } satisfies PreferencesInput);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: errorMessage("VALIDATION_FAILED") } };
  }
  const next = toProfilePreferences(parsed.data);
  const profile = ensureApplicant(session);
  profile.targetSeniority = next.targetSeniority;
  profile.locationPref = next.locationPref;
  revalidateProfile();
  return { ok: true, data: next };
}

export async function importLinkedInExport(formData: FormData): Promise<ActionResult<LinkedInImportInfo>> {
  const session = await requireApplicant();
  const profile = ensureApplicant(session);
  const files = formData.getAll("files").filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: "Choose your LinkedIn export files." } };
  }
  try {
    const { isSupabaseConfigured } = await import("@/lib/supabase/config");
    if (!isSupabaseConfigured()) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "LinkedIn import to the database requires Supabase. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
        },
      };
    }
    const { extractOnboardingCsvs } = await import("@/lib/linkedin/extract-csvs");
    const { resolveSupabaseApplicantId } = await import("@/lib/linkedin/resolve-applicant-id");
    const { persistLinkedInOnboardingImport } = await import("@/lib/linkedin/persist-import");
    const applicantUuid = await resolveSupabaseApplicantId(session.email);
    if (!applicantUuid) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message:
            "No Supabase profile matches your sign-in email. Use an account that exists in Supabase, or add your email to profiles.",
        },
      };
    }
    const csvs = await extractOnboardingCsvs(files);
    const source = files.some((f) => f.name.toLowerCase().endsWith(".zip")) ? "zip" : "csv";
    const info = await persistLinkedInOnboardingImport(applicantUuid, csvs, source);
    profile.linkedin = info;
    revalidateProfile();
    return { ok: true, data: info };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "We couldn't import that export.";
    return { ok: false, error: { code: "VALIDATION_FAILED", message } };
  }
}
