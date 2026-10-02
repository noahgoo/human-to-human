"use client";

import { StatusChip } from "@/components/shared/chips";
import type { ApplicationStatus } from "@/lib/types";
import { StatusActions, useApplicationStatus } from "./status-actions";

export function ApplicantDecisionBar({
  jobId,
  applicationId,
  name,
  headline,
  initialStatus,
}: {
  jobId: string;
  applicationId: string;
  name: string;
  headline: string | null;
  initialStatus: ApplicationStatus;
}) {
  const { status, pending, change } = useApplicationStatus(initialStatus, jobId, applicationId);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-h1">{name}</h1>
        <StatusChip status={status} audience="recruiter" />
      </div>
      {headline && <p className="mt-1 text-body text-copy">{headline}</p>}
      <div className="mt-4">
        <StatusActions
          jobId={jobId}
          applicationId={applicationId}
          status={status}
          surface="detail"
          pending={pending}
          onChange={change}
        />
      </div>
    </div>
  );
}
