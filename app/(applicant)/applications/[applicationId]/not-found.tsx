import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ApplicationNotFound() {
  return (
    <div className="rounded-xl border bg-card px-6 py-12 text-center shadow-1">
      <h1 className="text-h2">We couldn&apos;t find that application.</h1>
      <p className="mt-1 text-body text-copy">It may belong to someone else, or the link is out of date.</p>
      <Button asChild className="mt-4">
        <Link href="/applications">Back to My applications</Link>
      </Button>
    </div>
  );
}
