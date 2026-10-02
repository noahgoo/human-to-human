"use client";

import { useState, useTransition, useOptimistic } from "react";
import { toast } from "sonner";
import { Copy, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { revealApplicantEmail, setApplicationStatus } from "@/app/(recruiter)/recruiter/jobs/[jobId]/actions";
import type { ApplicationStatus } from "@/lib/types";

export function useApplicationStatus(initial: ApplicationStatus, jobId: string, applicationId: string) {
  const [status, setOptimistic] = useOptimistic(initial);
  const [pending, startTransition] = useTransition();

  function change(next: ApplicationStatus) {
    startTransition(async () => {
      setOptimistic(next);
      const result = await setApplicationStatus(jobId, applicationId, next);
      if (!result.ok) toast.error(result.error.message);
      else if (next === "shortlisted") toast.success("Shortlisted");
      else if (next === "rejected") toast.success("Rejected");
      else toast.success("Moved back to New");
    });
  }

  return { status, pending, change };
}

export function StatusActions({
  jobId,
  applicationId,
  status,
  surface,
  pending,
  onChange,
}: {
  jobId: string;
  applicationId: string;
  status: ApplicationStatus;
  surface: "list" | "detail";
  pending: boolean;
  onChange: (next: ApplicationStatus) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reconsiderOpen, setReconsiderOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [revealing, startReveal] = useTransition();

  const canShortlist = status === "submitted";
  const canReject = status === "submitted" || status === "shortlisted";
  const canMoveBack = surface === "detail" && status === "shortlisted";
  const canReconsider = surface === "detail" && status === "rejected";
  const canReveal = surface === "detail" && status === "shortlisted";

  function reveal() {
    startReveal(async () => {
      const result = await revealApplicantEmail(jobId, applicationId);
      if (!result.ok) toast.error(result.error.message);
      else setEmail(result.data.email);
    });
  }

  async function copyEmail() {
    if (!email) return;
    await navigator.clipboard.writeText(email);
    toast.success("Email copied");
  }

  if (status === "withdrawn") {
    if (surface === "list") return null;
    return <p className="text-small text-muted-foreground">Withdrawn applications cannot be changed.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canShortlist && (
          <Button type="button" size="sm" disabled={pending} onClick={() => onChange("shortlisted")}>
            Shortlist
          </Button>
        )}
        {canMoveBack && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onChange("submitted")}>
            Move back to New
          </Button>
        )}
        {canReconsider && (
          <Button type="button" size="sm" disabled={pending} onClick={() => setReconsiderOpen(true)}>
            Reconsider
          </Button>
        )}
        {canReject && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setRejectOpen(true)}>
            Reject
          </Button>
        )}
        {canReveal && !email && (
          <Button type="button" size="sm" variant="secondary" disabled={pending || revealing} onClick={reveal}>
            {revealing ? "Revealing…" : "Reveal email"}
          </Button>
        )}
      </div>

      {email && (
        <div className="rounded-md border bg-muted px-3 py-2">
          <p className="text-body text-foreground">{email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={copyEmail}>
              <Copy />
              Copy
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`mailto:${email}`}>
                <Mail />
                Email
              </a>
            </Button>
          </div>
          <p className="mt-2 text-small text-muted-foreground">Reveals are logged</p>
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this applicant?</DialogTitle>
            <DialogDescription>The applicant will be notified by email.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setRejectOpen(false);
                onChange("rejected");
              }}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reconsiderOpen} onOpenChange={setReconsiderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconsider this applicant?</DialogTitle>
            <DialogDescription>This applicant already received a rejection email.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReconsiderOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                setReconsiderOpen(false);
                onChange("shortlisted");
              }}
            >
              Reconsider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
