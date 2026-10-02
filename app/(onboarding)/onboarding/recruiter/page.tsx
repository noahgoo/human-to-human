import { requireOnboarding } from "@/lib/auth/session";
import { inspectWorkEmail } from "@/lib/data/companies";
import { ClaimForm } from "./claim-form";

export const metadata = { title: "Verify your company" };

export default async function RecruiterOnboardingPage() {
  const session = await requireOnboarding("recruiter");
  const initialCheck = inspectWorkEmail({ email: session.email, companyName: "", website: "" });

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8">
      <h1 className="text-h1">Verify your company</h1>
      <p className="mt-1 text-body text-copy">Tell us where you work. One recruiter per company in this version.</p>
      <ClaimForm email={session.email} initialCheck={initialCheck} />
    </div>
  );
}
