"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { approveCompany, rejectCompany } from "@/app/(admin)/admin/companies/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { VerificationStatus } from "@/lib/types";

export function CompanyActions({
  companyId,
  name,
  status,
}: {
  companyId: string;
  name: string;
  status: VerificationStatus;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      const result = await approveCompany(companyId);
      if (!result.ok) toast.error(result.error.message);
      else toast.success(`${name} approved`);
    });
  }

  function reject() {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError("Enter a reason for the rejection.");
      return;
    }
    startTransition(async () => {
      const result = await rejectCompany(companyId, trimmed);
      if (!result.ok) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      setOpen(false);
      setReason("");
      setError(null);
      toast.success(`${name} rejected`);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "verified" && (
        <Button type="button" size="sm" disabled={pending} onClick={approve}>
          Approve
        </Button>
      )}
      {status !== "rejected" && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setOpen(true)}>
          Reject
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {name}?</DialogTitle>
            <DialogDescription>The company and its recruiter membership will be marked rejected.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`reject-${companyId}`}>Reason</Label>
            <Textarea
              id={`reject-${companyId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `reject-error-${companyId}` : undefined}
              placeholder="Why is this company being rejected?"
            />
            {error && (
              <p id={`reject-error-${companyId}`} className="text-small text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={reject}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
