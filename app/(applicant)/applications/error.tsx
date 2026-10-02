"use client";

import { Button } from "@/components/ui/button";

export default function ApplicationsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-xl border bg-card px-6 py-12 text-center shadow-1">
      <h1 className="text-h2">Something went wrong on our side.</h1>
      <p className="mt-1 text-body text-copy">We couldn&apos;t load your applications.</p>
      <Button type="button" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
