import "server-only";
import { db } from "@/lib/mock/db";
import type { VerificationStatus } from "@/lib/types";

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
  blockedDomains: string[];
}

export async function loadAdminCompanies(): Promise<AdminQueue> {
  const store = db();
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
      rejectionReason: company.reviewReason,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const counts: Record<VerificationStatus, number> = { pending: 0, verified: 0, rejected: 0 };
  for (const row of rows) counts[row.verificationStatus] += 1;
  return { rows, counts, blockedDomains: store.blockedEmailDomains };
}
