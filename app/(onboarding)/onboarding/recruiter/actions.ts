"use server";

import { revalidatePath } from "next/cache";
import { markOnboarded, requireOnboarding } from "@/lib/auth/session";
import { emailDomain, inspectWorkEmail, normalizeWebsite, type WorkEmailInspection } from "@/lib/data/companies";
import { errorMessage } from "@/lib/copy";
import { db, newId } from "@/lib/mock/db";
import type { ActionResult } from "@/lib/types";
import { z } from "zod";

const claimSchema = z.object({
  companyName: z.string().trim().min(2, "Enter your company name.").max(120, "Company name must be 120 characters or fewer."),
  website: z.string().trim().max(200, "Website must be 200 characters or fewer."),
});

function fail(code: string, message?: string, fields?: Record<string, string>): ActionResult<never> {
  return { ok: false, error: { code, message: message ?? errorMessage(code), fields } };
}

export async function checkWorkEmailDomain(input: { companyName?: string; website?: string }): Promise<ActionResult<WorkEmailInspection>> {
  const session = await requireOnboarding("recruiter");
  const companyName = typeof input?.companyName === "string" ? input.companyName : "";
  const website = typeof input?.website === "string" ? input.website : "";
  return { ok: true, data: inspectWorkEmail({ email: session.email, companyName, website }) };
}

export async function startCompanyClaim(input: { companyName: string; website: string }): Promise<ActionResult<{ companyId: string; next: string }>> {
  const session = await requireOnboarding("recruiter");
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return fail("VALIDATION_FAILED", undefined, fields);
  }

  const check = inspectWorkEmail({
    email: session.email,
    companyName: parsed.data.companyName,
    website: parsed.data.website,
  });
  if (check.kind === "free_mail") {
    return fail("VALIDATION_FAILED", `${check.domain || "That address"} is a personal email domain, so it can't verify a company.`);
  }
  if (check.kind === "has_recruiter") {
    return fail("CONFLICT", "This company already has a recruiter account.");
  }
  if (check.kind === "invalid_website") {
    return fail("VALIDATION_FAILED", "Enter a valid website, like https://brightforge.io.", {
      website: "Enter a valid website, like https://brightforge.io.",
    });
  }

  const website = normalizeWebsite(parsed.data.website);
  if (!website.ok) {
    return fail("VALIDATION_FAILED", "Enter a valid website, like https://brightforge.io.", {
      website: "Enter a valid website, like https://brightforge.io.",
    });
  }

  const store = db();
  if (store.memberships.some((membership) => membership.recruiterId === session.userId)) {
    return fail("CONFLICT", "You already have a company claim.");
  }

  const companyId = newId("co");
  const domain = emailDomain(session.email);
  store.companies.push({
    id: companyId,
    name: parsed.data.companyName.trim().replace(/\s+/g, " "),
    website: website.value,
    logoUrl: null,
    verificationStatus: "pending",
    domains: domain ? [domain] : [],
    description: null,
  });
  store.memberships.push({
    recruiterId: session.userId,
    companyId,
    verificationStatus: "pending",
    workEmail: session.email,
  });
  await markOnboarded(session.userId);
  revalidatePath("/recruiter/pending");
  revalidatePath("/recruiter/jobs");
  revalidatePath("/recruiter/company");
  const next = check.kind === "magic_link" ? "/recruiter/pending?sent=1" : "/recruiter/pending";
  return { ok: true, data: { companyId, next } };
}
