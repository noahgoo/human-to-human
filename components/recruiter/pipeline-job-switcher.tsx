"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PipelineJobSwitcher({
  jobs,
  jobId,
}: {
  jobs: { id: string; title: string; applicantCount: number }[];
  jobId: string;
}) {
  const router = useRouter();
  return (
    <div className="w-full sm:w-80">
      <Label htmlFor="job-switcher" className="sr-only">
        Switch job
      </Label>
      <Select value={jobId} onValueChange={(id) => router.push(`/recruiter/jobs/${id}`)}>
        <SelectTrigger id="job-switcher" className="w-full" aria-label="Switch job">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {jobs.map((job) => (
            <SelectItem key={job.id} value={job.id}>
              {job.title} ({job.applicantCount} {job.applicantCount === 1 ? "applicant" : "applicants"})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
