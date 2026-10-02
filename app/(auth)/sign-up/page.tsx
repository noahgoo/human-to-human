import type { Metadata } from "next";
import Link from "next/link";
import { OAuthButtons, OrDivider } from "@/components/auth/oauth-buttons";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Create account · NexusPulse" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role: roleParam } = await searchParams;
  const role = roleParam === "recruiter" ? "recruiter" : "applicant";

  return (
    <div>
      <header className="mb-6">
        <h2 className="text-h2">Create an account</h2>
        <p className="mt-1 text-body text-copy">
          {role === "recruiter"
            ? "Use your work email so we can verify your company."
            : "Job seekers start with 10 monthly application credits."}
        </p>
      </header>
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-md border bg-muted p-1" role="tablist" aria-label="Account type">
        <Link
          href="/sign-up?role=applicant"
          role="tab"
          aria-selected={role === "applicant"}
          className={cn(
            "flex min-h-10 items-center justify-center rounded-md px-2 text-center text-small outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            role === "applicant" ? "bg-card text-foreground shadow-1" : "text-copy hover:text-foreground",
          )}
        >
          Job seeker
        </Link>
        <Link
          href="/sign-up?role=recruiter"
          role="tab"
          aria-selected={role === "recruiter"}
          className={cn(
            "flex min-h-10 items-center justify-center rounded-md px-2 text-center text-small outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            role === "recruiter" ? "bg-card text-foreground shadow-1" : "text-copy hover:text-foreground",
          )}
        >
          Recruiter
        </Link>
      </div>
      <OAuthButtons flow="sign-up" role={role} />
      <OrDivider />
      <SignUpForm role={role} />
      <p className="mt-6 border-t pt-5 text-center text-body text-copy">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-semibold text-link outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
