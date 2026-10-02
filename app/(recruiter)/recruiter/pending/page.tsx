import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { VerificationBanner, SUPPORT_HREF } from "@/components/recruiter/verification-banner";
import { Button } from "@/components/ui/button";
import { ResendButton } from "./resend-button";

export const metadata = { title: "Verification pending · NexusPulse" };

export default async function PendingPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const session = await requireRole("recruiter");
  if (session.membershipStatus === "verified") redirect("/recruiter/jobs");
  const { sent } = await searchParams;
  const company = session.companyName ?? "your company";
  const rejected = session.membershipStatus === "rejected";

  return (
    <>
      <VerificationBanner status={session.membershipStatus} />
      <div className="mx-auto max-w-xl rounded-xl border bg-card p-6 shadow-1">
        {rejected ? (
          <>
            <h1 className="text-h2">We couldn&apos;t verify {company}</h1>
            <p className="mt-2 text-body text-copy">Your company claim was rejected. Contact support and we&apos;ll help you sort it out.</p>
            <Button asChild className="mt-6">
              <a href={SUPPORT_HREF}>Contact support</a>
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-h2">We&apos;re verifying {company}</h1>
            <p className="mt-2 text-body text-copy">This usually takes 1 business day. We&apos;ll email you.</p>
            {sent === "1" && (
              <div className="mt-5 rounded-lg border bg-muted/50 p-4">
                <p className="text-body text-foreground">We sent a confirmation link to {session.email}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <ResendButton />
                  <Button asChild variant="outline">
                    <Link href="/verify/work-email?token=demo">Open confirmation link (demo)</Link>
                  </Button>
                </div>
              </div>
            )}
            <p className="mt-6 text-body text-copy">
              <Link href="/recruiter/jobs" className="font-medium text-link underline underline-offset-4">
                You can draft jobs while you wait
              </Link>
            </p>
          </>
        )}
      </div>
    </>
  );
}
