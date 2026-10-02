import Link from "next/link";
import { EmptyState } from "@/components/shared/misc";
import { Button } from "@/components/ui/button";

export default function JobNotFound() {
  return (
    <EmptyState
      title="We could not find that."
      body="It may belong to another company, or the link is out of date."
      action={
        <Button asChild>
          <Link href="/recruiter/jobs">Back to jobs</Link>
        </Button>
      }
    />
  );
}
