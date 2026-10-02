import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ApplicantNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-3 py-8">
      <h1 className="text-h1">Application not found</h1>
      <p className="text-body text-copy">That application isn&apos;t on this job.</p>
      <Button asChild>
        <Link href="/recruiter/jobs">Back to jobs</Link>
      </Button>
    </div>
  );
}
