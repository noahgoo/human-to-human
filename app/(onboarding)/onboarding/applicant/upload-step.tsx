"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ApplicantProfile, WorkMode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { PreferencesFields } from "@/components/onboarding/preferences-fields";
import { gateFromStatus, onboardingGaps, type UploadGate } from "@/components/onboarding/readiness";
import { LinkedInImportCard } from "@/components/uploads/linkedin-import-card";
import { ResumeCard } from "@/components/uploads/resume-card";
import { savePreferences } from "@/app/(applicant)/profile/actions";

export function UploadStep({ profile }: { profile: ApplicantProfile | null }) {
  const router = useRouter();
  const [linkedinGate, setLinkedinGate] = useState<UploadGate>(gateFromStatus(profile?.linkedin?.status, false));
  const [resumeGate, setResumeGate] = useState<UploadGate>(
    gateFromStatus(profile?.resume?.parseStatus, profile?.resume?.parseStatus === "failed"),
  );
  const [seniority, setSeniority] = useState(profile?.targetSeniority ?? "");
  const [location, setLocation] = useState<"" | WorkMode>(profile?.locationPref ?? "");
  const [pending, setPending] = useState(false);
  const gaps = onboardingGaps(linkedinGate, resumeGate);
  const ready = gaps.length === 0;

  async function onContinue(event: FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    const saved = await savePreferences({
      targetSeniority: seniority.trim() ? seniority.trim() : null,
      locationPref: location || null,
    });
    setPending(false);
    if (!saved.ok) {
      toast.error(saved.error.message);
      return;
    }
    router.push("/onboarding/applicant?step=review");
  }

  return (
    <form onSubmit={onContinue} className="flex flex-col gap-8">
      <div>
        <h1 className="text-h1">Import your network and resume</h1>
        <p className="mt-1 max-w-2xl text-body text-copy">
          Upload your LinkedIn export and a resume. Both are required before you can continue.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        <LinkedInImportCard initial={profile?.linkedin ?? null} onGateChange={setLinkedinGate} />
        <div className="flex flex-col gap-6">
          <ResumeCard initial={profile?.resume ?? null} onGateChange={setResumeGate} />
          <section className="rounded-xl border bg-card p-5 shadow-1 sm:p-6">
            <h2 className="text-body font-semibold text-foreground">Preferences</h2>
            <p className="mt-0.5 text-small text-muted-foreground">Optional. You can change these later from your profile.</p>
            <div className="mt-4">
              <PreferencesFields
                seniority={seniority}
                location={location}
                onSeniority={setSeniority}
                onLocation={setLocation}
                idPrefix="onboarding"
              />
            </div>
          </section>
        </div>
      </div>

      <section className="rounded-xl border border-token/20 bg-token-subtle p-4 sm:p-5">
        <p className="text-body text-foreground">
          10 free credits every month. Jobs cost 1–3 credits. Unused credits don&apos;t roll over.
        </p>
      </section>

      <div className="flex flex-col items-stretch gap-3 border-t pt-4 sm:items-end">
        <Button type="submit" disabled={!ready || pending} aria-describedby={gaps.length > 0 ? "onboarding-gaps" : undefined}>
          {pending ? "Saving…" : "Continue"}
        </Button>
        {gaps.length > 0 && (
          <ul id="onboarding-gaps" aria-live="polite" className="space-y-1 text-small text-copy sm:text-right">
            {gaps.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}
