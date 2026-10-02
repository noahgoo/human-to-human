"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { errorMessage } from "@/lib/copy";
import { admin } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

const schema = z.object({
  role: z.enum(["applicant", "recruiter"]),
});

export async function selectRole(role: "applicant" | "recruiter"): Promise<ActionResult<null>> {
  const parsed = schema.safeParse({ role });
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: errorMessage("VALIDATION_FAILED") } };
  }
  const session = await requireUser();
  if (session.role && session.role !== parsed.data.role) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Your account already has a role." } };
  }
  const db = admin();
  if (!session.role) {
    const { error } = await db.from("profiles").update({ role: parsed.data.role }).eq("id", session.userId).is("role", null);
    if (error) return { ok: false, error: { code: "INTERNAL", message: errorMessage("INTERNAL") } };
  }
  if (parsed.data.role === "applicant") {
    await db.from("applicant_profiles").upsert({ profile_id: session.userId }, { onConflict: "profile_id", ignoreDuplicates: true });
  }
  redirect(`/onboarding/${parsed.data.role}`);
}
