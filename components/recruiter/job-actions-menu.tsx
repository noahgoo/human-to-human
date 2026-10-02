"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  archiveJob,
  closeJob,
  deleteDraftJob,
  publishJob,
  reopenJob,
} from "@/app/(recruiter)/recruiter/jobs/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActionResult, JobStatus } from "@/lib/types";
import { archiveJobCopy, closeJobCopy, JobConfirmDialog } from "./job-confirm-dialog";

export function JobActionsMenu({
  job,
  verified,
}: {
  job: {
    id: string;
    title: string;
    status: JobStatus;
    applicationCount: number;
    unactedCount: number;
  };
  verified: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"close" | "archive" | "delete" | null>(null);

  async function run(action: () => Promise<ActionResult<{ id: string }>>, message: string) {
    const result = await action();
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success(message);
    setDialog(null);
    router.refresh();
  }

  const canDelete = job.status === "draft" && job.applicationCount === 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label={`Actions for ${job.title}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/recruiter/jobs/${job.id}/edit`}>Edit</Link>
          </DropdownMenuItem>
          {verified && job.status !== "draft" && (
            <DropdownMenuItem asChild>
              <Link href={`/recruiter/jobs/${job.id}`}>View applicants</Link>
            </DropdownMenuItem>
          )}
          {job.status === "draft" && verified && (
            <DropdownMenuItem onSelect={() => void run(() => publishJob(job.id), "Job published.")}>
              Publish
            </DropdownMenuItem>
          )}
          {job.status === "closed" && verified && (
            <DropdownMenuItem onSelect={() => void run(() => reopenJob(job.id), "Job reopened.")}>
              Reopen
            </DropdownMenuItem>
          )}
          {job.status === "open" && (
            <DropdownMenuItem onSelect={() => setDialog("close")}>Close</DropdownMenuItem>
          )}
          {(job.status === "open" || job.status === "closed") && (
            <DropdownMenuItem onSelect={() => setDialog("archive")}>Archive</DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                Delete draft
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <JobConfirmDialog
        open={dialog === "close"}
        onOpenChange={(open) => setDialog(open ? "close" : null)}
        title="Close this job?"
        description={closeJobCopy()}
        confirmLabel="Close job"
        onConfirm={() => run(() => closeJob(job.id), "Job closed.")}
      />
      <JobConfirmDialog
        open={dialog === "archive"}
        onOpenChange={(open) => setDialog(open ? "archive" : null)}
        title="Archive this job?"
        description={archiveJobCopy(job.unactedCount)}
        confirmLabel="Archive job"
        onConfirm={() => run(() => archiveJob(job.id), "Job archived.")}
      />
      <JobConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title="Delete this draft?"
        description="This draft will be removed. This can't be undone."
        confirmLabel="Delete draft"
        destructive
        onConfirm={() => run(() => deleteDraftJob(job.id), "Draft deleted.")}
      />
    </>
  );
}
