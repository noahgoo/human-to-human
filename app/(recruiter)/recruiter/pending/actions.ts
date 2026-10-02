"use server";

import { requireRole } from "@/lib/auth/session";
import { errorMessage } from "@/lib/copy";
import type { ActionResult } from "@/lib/types";

export async function resendWorkEmailVerification(): Promise<ActionResult<{ sent: true }>> {
  const session = await requireRole("recruiter");
  if (session.membershipStatus === "verified") {
    return { ok: false, error: { code: "CONFLICT", message: "This company is already verified." } };
  }
  if (session.membershipStatus !== "pending") {
    return { ok: false, error: { code: "CONFLICT", message: errorMessage("CONFLICT") } };
  }
  return { ok: true, data: { sent: true } };
}
