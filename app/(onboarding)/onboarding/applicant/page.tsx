import type { Metadata } from "next";
import { requireOnboarding } from "@/lib/auth/session";
import { getApplicantProfile } from "@/lib/data/profile";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";
import { ReviewStep } from "./review-step";
import { UploadStep } from "./upload-step";

export const metadata: Metadata = { title: "Set up your profile · NexusPulse" };

export default async function ApplicantOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const session = await requireOnboarding("applicant");
  const { step } = await searchParams;
  const reviewing = step === "review";
  const profile = await getApplicantProfile(session.userId);

  return (
    <div className="flex flex-col gap-8">
      <OnboardingStepper current={reviewing ? 3 : 2} />
      {reviewing ? <ReviewStep profile={profile} /> : <UploadStep profile={profile} />}
    </div>
  );
}
