"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ApplyDialog,
  insufficientCreditsCopy,
  useLiveTokenBalance,
  type ApplyJob,
} from "@/components/applications/apply-dialog";
import { StatusChip } from "@/components/shared/chips";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/copy";
import type { ApplicationStatus, TokenBalance } from "@/lib/types";

export function ApplyCard({
  job,
  balance: initialBalance,
  applied,
}: {
  job: ApplyJob;
  balance: TokenBalance;
  applied: { applicationId: string; status: ApplicationStatus } | null;
}) {
  const balance = useLiveTokenBalance(initialBalance);
  const [open, setOpen] = useState(false);
  const reason = applied
    ? null
    : job.status !== "open"
      ? "This job is no longer accepting applications."
      : balance.balance < job.tokenCost
        ? insufficientCreditsCopy(job.tokenCost, balance.balance, balance.resetsAt)
        : null;

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-1">
      <h2 className="text-h3">Apply</h2>
      <p className="mt-1 text-body text-copy">This application costs {formatCredits(job.tokenCost)}.</p>
      <div className="mt-4">
        {applied ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={applied.status} audience="applicant" />
            <Button variant="link" size="sm" asChild>
              <Link href={`/applications/${applied.applicationId}`}>View application</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button type="button" onClick={() => setOpen(true)} disabled={Boolean(reason)} aria-describedby={reason ? "apply-reason" : undefined}>
              Apply · {formatCredits(job.tokenCost)}
            </Button>
            {reason && (
              <p id="apply-reason" className="text-small text-muted-foreground">
                {reason}
              </p>
            )}
          </div>
        )}
      </div>
      <ApplyDialog job={job} balance={initialBalance} open={open} onOpenChange={setOpen} />
    </section>
  );
}
