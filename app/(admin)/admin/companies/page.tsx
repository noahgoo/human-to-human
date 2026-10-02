import Link from "next/link";
import { BlockedDomains } from "@/components/admin/blocked-domains";
import { CompanyActions } from "@/components/admin/company-actions";
import { EmptyState, PageHeader } from "@/components/shared/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadAdminCompanies } from "@/lib/data/admin";
import type { VerificationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS: { id: VerificationStatus; label: string; empty: string }[] = [
  { id: "pending", label: "Pending", empty: "No companies waiting for review." },
  { id: "verified", label: "Verified", empty: "No verified companies." },
  { id: "rejected", label: "Rejected", empty: "No rejected companies." },
];

const MEMBERSHIP_TONE: Record<VerificationStatus, string> = {
  pending: "bg-warning-subtle text-warning-fg border-warning/30",
  verified: "bg-success-subtle text-success-fg border-success/20",
  rejected: "bg-muted text-muted-foreground border-border",
};

function tabHref(id: VerificationStatus) {
  return id === "pending" ? "/admin/companies" : `/admin/companies?tab=${id}`;
}

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: VerificationStatus = raw === "verified" || raw === "rejected" ? raw : "pending";
  const queue = await loadAdminCompanies();
  const rows = queue.rows.filter((row) => row.verificationStatus === tab);
  const empty = TABS.find((item) => item.id === tab)?.empty ?? "No companies.";

  return (
    <div>
      <PageHeader
        title="Company verification"
        description="Approve or reject companies before their recruiters can publish jobs."
      />
      <nav aria-label="Verification status" className="mb-4 flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {TABS.map((item) => {
          const selected = item.id === tab;
          return (
            <Link
              key={item.id}
              href={tabHref(item.id)}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-small outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "bg-card text-foreground shadow-1" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label} <span className="tabular-nums">({queue.counts[item.id]})</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <div className="rounded-xl border bg-card shadow-1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Domains</TableHead>
                <TableHead>Recruiter</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-normal">
                    <p className="font-medium text-foreground">{row.name}</p>
                    {row.rejectionReason && <p className="mt-0.5 text-small text-warning-fg">{row.rejectionReason}</p>}
                  </TableCell>
                  <TableCell className="whitespace-normal font-mono text-code">
                    {row.domains.length > 0 ? row.domains.join(", ") : "—"}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {row.recruiters.length === 0 ? (
                      <span className="text-muted-foreground">No recruiter</span>
                    ) : (
                      <ul className="space-y-1">
                        {row.recruiters.map((recruiter) => (
                          <li key={recruiter.workEmail} className="flex flex-wrap items-center gap-2">
                            <span>{recruiter.workEmail}</span>
                            <span
                              className={cn(
                                "inline-flex rounded-md border px-2 py-0.5 text-small capitalize",
                                MEMBERSHIP_TONE[recruiter.membershipStatus],
                              )}
                            >
                              {recruiter.membershipStatus}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell>
                    <CompanyActions companyId={row.id} name={row.name} status={row.verificationStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-8">
        <BlockedDomains domains={queue.blockedDomains} />
      </div>
    </div>
  );
}
