"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/misc";

export default function JobsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      title="Couldn't load jobs"
      body="Something went wrong while loading the marketplace."
      action={
        <Button type="button" onClick={reset}>
          Retry
        </Button>
      }
    />
  );
}
