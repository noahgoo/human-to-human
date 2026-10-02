"use server";

import { revalidatePath } from "next/cache";
import { markOnboarded, requireOnboarding } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/types";
import { getApplicantProfile } from "@/lib/data/profile";

export async function completeApplicantOnboarding(): Promise<ActionResult<{ href: string }>> {
  const session = await requireOnboarding("applicant");
  const profile = await getApplicantProfile(session.userId);
  const linkedinReady = profile?.linkedin?.status === "succeeded";
  const resumeReady = profile?.resume?.parseStatus === "succeeded";
  if (!linkedinReady || !resumeReady) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message:
        !linkedinReady && !resumeReady
          ? "Upload your LinkedIn export and resume before finishing."
          : !linkedinReady
            ? "Upload your LinkedIn export before finishing."
            : "Upload your resume before finishing.",
      },
    };
  }
  await markOnboarded(session.userId);
  revalidatePath("/onboarding/applicant");
  revalidatePath("/jobs");
  revalidatePath("/profile");
  revalidatePath("/applications");
  return { ok: true, data: { href: "/jobs?welcome=1" } };
}
