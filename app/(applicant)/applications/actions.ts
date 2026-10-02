"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { errorMessage } from "@/lib/copy";
import { db } from "@/lib/mock/db";
import type { ActionResult } from "@/lib/types";

export async function withdrawApplication(applicationId: string): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole("applicant");
  const application = db().applications.find((item) => item.id === applicationId);
  if (!application || application.applicantId !== session.userId) {
    return { ok: false, error: { code: "NOT_FOUND", message: errorMessage("NOT_FOUND") } };
  }
  if (application.status !== "submitted" && application.status !== "shortlisted") {
    return { ok: false, error: { code: "CONFLICT", message: "This application can't be withdrawn." } };
  }
  const at = new Date().toISOString();
  application.events.push({ fromStatus: application.status, toStatus: "withdrawn", at });
  application.status = "withdrawn";
  application.updatedAt = at;
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true, data: { id: application.id } };
}
