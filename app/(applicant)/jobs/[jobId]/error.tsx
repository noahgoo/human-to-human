"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/misc";

export default function JobDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      title="Couldn't load this job"
      body="Something went wrong while opening the role."
      action={
        <Button type="button" onClick={reset}>
          Retry
        </Button>
      }
    />
  );
}
