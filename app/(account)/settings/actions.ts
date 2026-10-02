"use server";

import { requireUser } from "@/lib/auth/session";
import { getTokenBalance } from "@/lib/data/tokens";
import { errorMessage } from "@/lib/copy";
import { db } from "@/lib/mock/db";
import type { ActionResult, Role } from "@/lib/types";
import { passwordSchema, type PasswordValues } from "@/components/auth/schemas";
import { flattenError, type ZodError } from "zod";

function validationFailure(error: ZodError): ActionResult<null> {
  const flat = flattenError(error);
  const fields: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat.fieldErrors)) {
    const message = Array.isArray(messages) ? messages.find((item) => typeof item === "string") : undefined;
    if (message) fields[key] = message;
  }
  return {
    ok: false,
    error: {
      code: "VALIDATION_FAILED",
      message: errorMessage("VALIDATION_FAILED"),
      fields: Object.keys(fields).length ? fields : undefined,
    },
  };
}

export async function changePassword(input: PasswordValues): Promise<ActionResult<null>> {
  await requireUser();
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  return { ok: true, data: null };
}

export type AccountExport = {
  exportedAt: string;
  account: { fullName: string; email: string; role: Role | null };
  profile?: unknown;
  applications?: unknown[];
  fitEvaluations?: unknown[];
  connections?: unknown[];
  credits?: unknown;
  membership?: unknown;
  company?: unknown;
};

export async function exportMyData(): Promise<ActionResult<AccountExport>> {
  const session = await requireUser();
  const store = db();
  const account = { fullName: session.fullName, email: session.email, role: session.role };
  const exportedAt = new Date().toISOString();

  if (session.role === "applicant") {
    const balance = await getTokenBalance(session.userId);
    const applications = store.applications
      .filter((application) => application.applicantId === session.userId)
      .map(({ tokenCost, ...application }) => ({ ...application, creditCost: tokenCost }));
    return {
      ok: true,
      data: {
        exportedAt,
        account,
        profile: store.applicants.find((applicant) => applicant.id === session.userId) ?? null,
        applications,
        fitEvaluations: store.fitEvaluations.filter((fit) => fit.applicantId === session.userId),
        connections: store.connections.filter((connection) => connection.ownerId === session.userId),
        credits: {
          period: balance.period,
          granted: balance.granted,
          spent: balance.spent,
          refunded: balance.refunded,
          adjusted: balance.adjusted,
          total: balance.total,
          balance: balance.balance,
          resetsAt: balance.resetsAt,
        },
      },
    };
  }

  if (session.role === "recruiter") {
    const membership = store.memberships.find((item) => item.recruiterId === session.userId) ?? null;
    const company = membership ? (store.companies.find((item) => item.id === membership.companyId) ?? null) : null;
    return { ok: true, data: { exportedAt, account, membership, company } };
  }

  return { ok: true, data: { exportedAt, account } };
}
