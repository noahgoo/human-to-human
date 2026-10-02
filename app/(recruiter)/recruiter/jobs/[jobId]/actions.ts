"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { errorMessage } from "@/lib/copy";
import { db } from "@/lib/mock/db";
import type { ActionResult, ApplicationStatus } from "@/lib/types";

const ALLOWED: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["shortlisted", "rejected"],
  shortlisted: ["submitted", "rejected"],
  rejected: ["shortlisted"],
  withdrawn: [],
};

async function recruiterContext(jobId: string) {
  const session = await requireRole("recruiter");
  if (session.membershipStatus !== "verified" || !session.companyId) {
    return { ok: false as const, error: { code: "FORBIDDEN", message: errorMessage("FORBIDDEN") } };
  }
  const store = db();
  const job = store.jobs.find((item) => item.id === jobId && item.companyId === session.companyId);
  if (!job) return { ok: false as const, error: { code: "NOT_FOUND", message: errorMessage("NOT_FOUND") } };
  return { ok: true as const, session, store };
}

export async function setApplicationStatus(
  jobId: string,
  applicationId: string,
  toStatus: ApplicationStatus,
): Promise<ActionResult<{ status: ApplicationStatus }>> {
  const ctx = await recruiterContext(jobId);
  if (!ctx.ok) return ctx;
  const application = ctx.store.applications.find((item) => item.id === applicationId && item.jobId === jobId);
  if (!application) return { ok: false, error: { code: "NOT_FOUND", message: errorMessage("NOT_FOUND") } };
  if (!ALLOWED[application.status].includes(toStatus)) {
    return { ok: false, error: { code: "CONFLICT", message: "That status change is not allowed." } };
  }
  const fromStatus = application.status;
  const at = new Date().toISOString();
  application.status = toStatus;
  application.updatedAt = at;
  application.events.push({ fromStatus, toStatus, at, actorName: ctx.session.fullName });
  revalidatePath(`/recruiter/jobs/${jobId}`);
  revalidatePath(`/recruiter/jobs/${jobId}/applicants/${applicationId}`);
  return { ok: true, data: { status: toStatus } };
}

export async function revealApplicantEmail(
  jobId: string,
  applicationId: string,
): Promise<ActionResult<{ email: string }>> {
  const ctx = await recruiterContext(jobId);
  if (!ctx.ok) return ctx;
  const application = ctx.store.applications.find((item) => item.id === applicationId && item.jobId === jobId);
  if (!application) return { ok: false, error: { code: "NOT_FOUND", message: errorMessage("NOT_FOUND") } };
  if (application.status !== "shortlisted") {
    return { ok: false, error: { code: "FORBIDDEN", message: "Shortlist this applicant before revealing their email." } };
  }
  const person = ctx.store.applicants.find((item) => item.id === application.applicantId);
  if (!person) return { ok: false, error: { code: "NOT_FOUND", message: errorMessage("NOT_FOUND") } };
  return { ok: true, data: { email: person.email } };
}
