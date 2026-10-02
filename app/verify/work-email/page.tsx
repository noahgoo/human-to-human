import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { BRAND } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { ConfirmWorkEmailForm } from "./confirm-form";

export const metadata = { title: "Confirm work email" };

export default async function VerifyWorkEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const session = await requireUser();
  const { token } = await searchParams;
  const company = session.companyName ?? "your company";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2">
        <p className="text-small font-medium text-muted-foreground">{BRAND}</p>
        <h1 className="mt-2 text-h2">Confirm your work email</h1>
        {session.role !== "recruiter" ? (
          <p className="mt-3 text-body text-copy">This link confirms a recruiter work email.</p>
        ) : !token ? (
          <p className="mt-3 text-body text-copy">This confirmation link is missing or invalid.</p>
        ) : session.membershipStatus === "verified" ? (
          <>
            <p className="mt-3 text-body text-copy">{session.email} is already confirmed for {company}.</p>
            <Button asChild className="mt-6 w-full">
              <Link href="/recruiter/jobs">Go to jobs</Link>
            </Button>
          </>
        ) : !session.companyId ? (
          <>
            <p className="mt-3 text-body text-copy">Claim your company before confirming a work email.</p>
            <Button asChild className="mt-6 w-full">
              <Link href="/onboarding/recruiter">Verify your company</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="mt-3 text-body text-copy">
              Confirm <span className="font-medium text-foreground">{session.email}</span> for {company}. This verifies the company so you can publish jobs.
            </p>
            <ConfirmWorkEmailForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}
