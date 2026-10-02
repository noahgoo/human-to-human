"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEMO_ROLE_COOKIE, requireUser } from "@/lib/auth/session";
import { errorMessage } from "@/lib/copy";
import type { ActionResult } from "@/lib/types";

const schema = z.object({
  role: z.enum(["applicant", "recruiter"]),
});

export async function selectRole(role: "applicant" | "recruiter"): Promise<ActionResult<null>> {
  const parsed = schema.safeParse({ role });
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: errorMessage("VALIDATION_FAILED") } };
  }
  await requireUser();
  const persona = parsed.data.role === "recruiter" ? "recruiter_new" : "applicant_new";
  const jar = await cookies();
  jar.set(DEMO_ROLE_COOKIE, persona, { httpOnly: true, path: "/", sameSite: "lax" });
  redirect(`/onboarding/${parsed.data.role}`);
  return { ok: true, data: null };
}
