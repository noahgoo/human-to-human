"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { canPublish } from "@/lib/data/companies";
import { jobInputSchema, zodFieldErrors, type JobInput } from "@/components/recruiter/job-schema";
import { errorMessage } from "@/lib/copy";
import { db, newId } from "@/lib/mock/db";
import type { ActionResult, Job } from "@/lib/types";

function fail(code: string, message?: string, fields?: Record<string, string>): ActionResult<never> {
  return { ok: false, error: { code, message: message ?? errorMessage(code), fields } };
}

function refreshJob(id: string) {
  revalidatePath("/recruiter/jobs");
  revalidatePath(`/recruiter/jobs/${id}`);
  revalidatePath(`/recruiter/jobs/${id}/edit`);
}

async function context() {
  const session = await requireRole("recruiter");
  if (!session.companyId) return { ok: false as const, error: fail("FORBIDDEN") };
  const company = db().companies.find((item) => item.id === session.companyId);
  if (!company) return { ok: false as const, error: fail("NOT_FOUND") };
  return { ok: true as const, session, company };
}

function ownedJob(companyId: string, jobId: string) {
  return db().jobs.find((job) => job.id === jobId && job.companyId === companyId) ?? null;
}

function toJobFields(input: JobInput, locked?: Pick<Job, "tokenCost" | "isTechnical">): Pick<Job, "title" | "description" | "requirements" | "location" | "workMode" | "tokenCost" | "isTechnical"> {
  return {
    title: input.title,
    description: input.description,
    requirements: input.requirements,
    location: input.location.trim() ? input.location.trim() : null,
    workMode: input.workMode,
    tokenCost: locked?.tokenCost ?? input.tokenCost,
    isTechnical: locked?.isTechnical ?? input.isTechnical,
  };
}

export async function createJob(input: JobInput, intent: "draft" | "publish"): Promise<ActionResult<{ id: string }>> {
  const ctx = await context();
  if (!ctx.ok) return ctx.error;
  const parsed = jobInputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_FAILED", undefined, zodFieldErrors(parsed.error));
  if (intent === "publish" && !canPublish(ctx.session.membershipStatus, ctx.company.verificationStatus)) {
    return fail("FORBIDDEN", "Verify your company before you can publish.");
  }
  const now = new Date().toISOString();
  const id = newId("job");
  db().jobs.push({
    id,
    companyId: ctx.company.id,
    ...toJobFields(parsed.data),
    status: intent === "publish" ? "open" : "draft",
    publishedAt: intent === "publish" ? now : null,
    createdAt: now,
    updatedAt: now,
  });
  refreshJob(id);
  return { ok: true, data: { id } };
}

export async function updateJob(jobId: string, input: JobInput, intent: "draft" | "publish"): Promise<ActionResult<{ id: string }>> {
  const ctx = await context();
  if (!ctx.ok) return ctx.error;
  const job = ownedJob(ctx.company.id, jobId);
  if (!job) return fail("NOT_FOUND");
  if (job.status === "archived") return fail("CONFLICT", "Archived jobs can't be edited.");
  const parsed = jobInputSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION_FAILED", undefined, zodFieldErrors(parsed.error));
  if (intent === "draft" && job.status !== "draft") {
    return fail("CONFLICT", "This job is already published. Close it to stop new applications.");
  }
  if (intent === "publish" && !canPublish(ctx.session.membershipStatus, ctx.company.verificationStatus)) {
    return fail("FORBIDDEN", "Verify your company before you can publish.");
  }
  const apps = db().applications.filter((application) => application.jobId === job.id);
  const now = new Date().toISOString();
  Object.assign(job, toJobFields(parsed.data, apps.length > 0 ? job : undefined), { updatedAt: now });
  if (intent === "publish" && job.status !== "open") {
    job.status = "open";
    job.publishedAt = now;
  }
  refreshJob(job.id);
  return { ok: true, data: { id: job.id } };
}

export async function publishJob(jobId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await context();
  if (!ctx.ok) return ctx.error;
  if (!canPublish(ctx.session.membershipStatus, ctx.company.verificationStatus)) {
    return fail("FORBIDDEN", "Verify your company before you can publish.");
  }
  const job = ownedJob(ctx.company.id, jobId);
  if (!job) return fail("NOT_FOUND");
  if (job.status !== "draft") return fail("CONFLICT", "Only drafts can be published from the list.");
  const parsed = jobInputSchema.safeParse({
    title: job.title,
    location: job.location ?? "",
    workMode: job.workMode ?? "remote",
    description: job.description,
    requirements: job.requirements,
    isTechnical: job.isTechnical,
    tokenCost: job.tokenCost,
  });
  if (!parsed.success) return fail("VALIDATION_FAILED", "Finish the required fields before publishing.");
  const now = new Date().toISOString();
  job.status = "open";
  job.publishedAt = now;
  job.updatedAt = now;
  refreshJob(job.id);
  return { ok: true, data: { id: job.id } };
}

export async function reopenJob(jobId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await context();
  if (!ctx.ok) return ctx.error;
  if (!canPublish(ctx.session.membershipStatus, ctx.company.verificationStatus)) {
    return fail("FORBIDDEN", "Verify your company before you can publish.");
  }
  const job = ownedJob(ctx.company.id, jobId);
  if (!job) return fail("NOT_FOUND");
  if (job.status !== "closed") return fail("CONFLICT", "Only closed jobs can be reopened.");
  const now = new Date().toISOString();
  job.status = "open";
  job.publishedAt = job.publishedAt ?? now;
  job.updatedAt = now;
  refreshJob(job.id);
  return { ok: true, data: { id: job.id } };
}

export async function closeJob(jobId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await context();
  if (!ctx.ok) return ctx.error;
  const job = ownedJob(ctx.company.id, jobId);
  if (!job) return fail("NOT_FOUND");
  if (job.status !== "open") return fail("CONFLICT", "Only open jobs can be closed.");
  job.status = "closed";
  job.updatedAt = new Date().toISOString();
  refreshJob(job.id);
  return { ok: true, data: { id: job.id } };
}

export async function archiveJob(jobId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await context();
  if (!ctx.ok) return ctx.error;
  const store = db();
  const job = ownedJob(ctx.company.id, jobId);
  if (!job) return fail("NOT_FOUND");
  if (job.status !== "open" && job.status !== "closed") return fail("CONFLICT", "Only open or closed jobs can be archived.");
  const now = new Date().toISOString();
  for (const application of store.applications) {
    if (application.jobId !== job.id || application.status !== "submitted") continue;
    store.tokenAdjustments.push({
      applicantId: application.applicantId,
      kind: "refund",
      amount: application.tokenCost,
      at: now,
    });
  }
  job.status = "archived";
  job.updatedAt = now;
  refreshJob(job.id);
  return { ok: true, data: { id: job.id } };
}

export async function deleteDraftJob(jobId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await context();
  if (!ctx.ok) return ctx.error;
  const store = db();
  const job = ownedJob(ctx.company.id, jobId);
  if (!job) return fail("NOT_FOUND");
  if (job.status !== "draft") return fail("CONFLICT", "Only drafts can be deleted.");
  if (store.applications.some((application) => application.jobId === job.id)) {
    return fail("CONFLICT", "Drafts with applications can't be deleted.");
  }
  store.jobs = store.jobs.filter((item) => item.id !== job.id);
  refreshJob(job.id);
  return { ok: true, data: { id: job.id } };
}
