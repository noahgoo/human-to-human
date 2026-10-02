import "server-only";
import { db } from "@/lib/mock/db";
import type { VerificationStatus } from "@/lib/types";

export const BLOCKED_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me"] as const;

/** Company has no rejectedReason field. Reasons live here for the demo session. */
const rejectionReasons = new Map<string, string>();

export interface AdminCompanyRow {
  id: string;
  name: string;
  domains: string[];
  verificationStatus: VerificationStatus;
  workEmail: string | null;
  membershipStatus: VerificationStatus | null;
  rejectionReason: string | null;
}

export interface AdminCompanyQueue {
  rows: AdminCompanyRow[];
  counts: Record<VerificationStatus, number>;
}

export function loadAdminCompanies(): AdminCompanyQueue {
  const store = db();
  const rows: AdminCompanyRow[] = store.companies.map((company) => {
    const membership = store.memberships.find((item) => item.companyId === company.id);
    return {
      id: company.id,
      name: company.name,
      domains: company.domains,
      verificationStatus: company.verificationStatus,
      workEmail: membership?.workEmail ?? null,
      membershipStatus: membership?.verificationStatus ?? null,
      rejectionReason: rejectionReasons.get(company.id) ?? null,
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return {
    rows,
    counts: {
      pending: rows.filter((row) => row.verificationStatus === "pending").length,
      verified: rows.filter((row) => row.verificationStatus === "verified").length,
      rejected: rows.filter((row) => row.verificationStatus === "rejected").length,
    },
  };
}

export function rememberRejectionReason(companyId: string, reason: string): void {
  rejectionReasons.set(companyId, reason);
}

export function clearRejectionReason(companyId: string): void {
  rejectionReasons.delete(companyId);
}
