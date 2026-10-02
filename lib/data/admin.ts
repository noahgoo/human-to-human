import "server-only";
import { db } from "@/lib/mock/db";
import type { VerificationStatus } from "@/lib/types";

export const BLOCKED_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "proton.me",
] as const;

export interface AdminRecruiter {
  workEmail: string;
  membershipStatus: VerificationStatus;
}

export interface AdminCompanyRow {
  id: string;
  name: string;
  domains: string[];
  verificationStatus: VerificationStatus;
  recruiters: AdminRecruiter[];
  rejectionReason: string | null;
}

export interface AdminQueue {
  rows: AdminCompanyRow[];
  counts: Record<VerificationStatus, number>;
}

function reasonStore(): Record<string, string> {
  const g = globalThis as unknown as { __npCompanyRejectionReasons?: Record<string, string> };
  if (!g.__npCompanyRejectionReasons) g.__npCompanyRejectionReasons = {};
  return g.__npCompanyRejectionReasons;
}

/** Company has no createdAt and no rejection-reason field. Reasons live beside the mock store. */
export function setRejectionReason(companyId: string, reason: string | null) {
  const store = reasonStore();
  if (reason) store[companyId] = reason;
  else delete store[companyId];
}

export async function loadAdminCompanies(): Promise<AdminQueue> {
  const store = db();
  const reasons = reasonStore();
  const rows: AdminCompanyRow[] = store.companies
    .map((company) => ({
      id: company.id,
      name: company.name,
      domains: company.domains,
      verificationStatus: company.verificationStatus,
      recruiters: store.memberships
        .filter((membership) => membership.companyId === company.id)
        .map((membership) => ({
          workEmail: membership.workEmail,
          membershipStatus: membership.verificationStatus,
        })),
      rejectionReason: reasons[company.id] ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const counts: Record<VerificationStatus, number> = { pending: 0, verified: 0, rejected: 0 };
  for (const row of rows) counts[row.verificationStatus] += 1;
  return { rows, counts };
}
