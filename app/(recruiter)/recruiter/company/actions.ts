"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { normalizeWebsite } from "@/lib/data/companies";
import { errorMessage } from "@/lib/copy";
import { db } from "@/lib/mock/db";
import type { ActionResult } from "@/lib/types";

export async function updateCompanyProfile(input: {
  name: string;
  website: string;
  description: string;
}): Promise<ActionResult<{ name: string }>> {
  const session = await requireRole("recruiter");
  if (!session.companyId) return { ok: false, error: { code: "FORBIDDEN", message: errorMessage("FORBIDDEN") } };
  const company = db().companies.find((item) => item.id === session.companyId);
  if (!company) return { ok: false, error: { code: "NOT_FOUND", message: errorMessage("NOT_FOUND") } };

  const name = input.name.trim();
  const fields: Record<string, string> = {};
  if (name.length < 2 || name.length > 120) fields.name = "Enter a company name (2–120 characters).";
  const website = normalizeWebsite(input.website ?? "");
  if (!website.ok) fields.website = "Enter a valid website, or leave it blank.";
  const description = input.description.trim();
  if (description.length > 2_000) fields.description = "Keep the description under 2,000 characters.";
  if (Object.keys(fields).length || !website.ok) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: errorMessage("VALIDATION_FAILED"), fields } };
  }

  company.name = name;
  company.website = website.value;
  company.description = description || null;
  revalidatePath("/recruiter/company");
  revalidatePath("/recruiter/jobs");
  return { ok: true, data: { name } };
}
