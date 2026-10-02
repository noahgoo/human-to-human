import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/misc";

export default function JobNotFound() {
  return (
    <EmptyState
      title="Job not found"
      body="This role isn't open, or the company isn't verified."
      action={
        <Button asChild>
          <Link href="/jobs">Back to jobs</Link>
        </Button>
      }
    />
  );
}
