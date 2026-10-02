"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { errorMessage } from "@/lib/copy";
import { db } from "@/lib/mock/db";
import type { ActionResult } from "@/lib/types";

function fail(code: string, message?: string): ActionResult<never> {
  return { ok: false, error: { code, message: message ?? errorMessage(code) } };
}

export async function confirmWorkEmail(
  _prev: ActionResult<{ verified: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ verified: true }>> {
  const session = await requireUser();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return fail("VALIDATION_FAILED", "This confirmation link is missing or invalid.");
  if (session.role !== "recruiter") return fail("FORBIDDEN", "This link confirms a recruiter work email.");

  const store = db();
  const membership = store.memberships.find((item) => item.recruiterId === session.userId);
  if (!membership) return fail("NOT_FOUND", "Claim your company before confirming a work email.");
  const company = store.companies.find((item) => item.id === membership.companyId);
  if (!company) return fail("NOT_FOUND");

  membership.verificationStatus = "verified";
  company.verificationStatus = "verified";
  revalidatePath("/recruiter/jobs");
  revalidatePath("/recruiter/company");
  revalidatePath("/recruiter/pending");
  redirect("/recruiter/jobs?notice=verified");
}
