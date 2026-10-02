"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { errorMessage } from "@/lib/copy";
import { db } from "@/lib/mock/db";
import type { ActionResult, VerificationStatus } from "@/lib/types";

async function setCompanyStatus(
  companyId: string,
  status: VerificationStatus,
  reason: string | null,
): Promise<ActionResult<{ id: string }>> {
  await requireRole("admin");
  const store = db();
  const company = store.companies.find((item) => item.id === companyId);
  if (!company) return { ok: false, error: { code: "NOT_FOUND", message: errorMessage("NOT_FOUND") } };
  company.verificationStatus = status;
  for (const membership of store.memberships) {
    if (membership.companyId === companyId) membership.verificationStatus = status;
  }
  company.reviewReason = reason;
  revalidatePath("/admin/companies");
  return { ok: true, data: { id: companyId } };
}

export async function approveCompany(companyId: string): Promise<ActionResult<{ id: string }>> {
  return setCompanyStatus(companyId, "verified", null);
}

export async function rejectCompany(companyId: string, reason: string): Promise<ActionResult<{ id: string }>> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: "Enter a reason for the rejection." } };
  }
  return setCompanyStatus(companyId, "rejected", trimmed);
}
