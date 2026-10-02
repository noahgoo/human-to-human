"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ApplicantProfile } from "@/lib/types";
import { WORK_MODE_LABEL } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { gateFromStatus, onboardingGaps } from "@/components/onboarding/readiness";
import { formatImportCounts } from "@/components/uploads/import-summary";
import { completeApplicantOnboarding } from "./actions";

export function ReviewStep({ profile }: { profile: ApplicantProfile | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const gaps = onboardingGaps(
    gateFromStatus(profile?.linkedin?.status, false),
    gateFromStatus(profile?.resume?.parseStatus, profile?.resume?.parseStatus === "failed"),
  );
  const ready = gaps.length === 0;

  async function finish() {
    if (!ready || pending) return;
    setPending(true);
    const result = await completeApplicantOnboarding();
    if (!result.ok) {
      setPending(false);
      toast.error(result.error.message);
      return;
    }
    toast.success("You have 10 credits this month");
    router.push(result.data.href);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-h1">Review and finish</h1>
        <p className="mt-1 text-body text-copy">Confirm your export, resume, and preferences.</p>
      </div>

      <dl className="divide-y rounded-xl border bg-card shadow-1">
        <div className="grid gap-1 px-5 py-4 sm:grid-cols-[12rem_1fr] sm:gap-4">
          <dt className="text-small font-semibold text-foreground">LinkedIn</dt>
          <dd className="text-body text-copy">
            {profile?.linkedin?.status === "succeeded"
              ? formatImportCounts(profile.linkedin.counts)
              : "Not imported yet"}
          </dd>
        </div>
        <div className="grid gap-1 px-5 py-4 sm:grid-cols-[12rem_1fr] sm:gap-4">
          <dt className="text-small font-semibold text-foreground">Resume</dt>
          <dd className="font-mono text-code text-foreground">
            {profile?.resume?.parseStatus === "succeeded" ? profile.resume.fileName : "Not uploaded yet"}
          </dd>
        </div>
        <div className="grid gap-1 px-5 py-4 sm:grid-cols-[12rem_1fr] sm:gap-4">
          <dt className="text-small font-semibold text-foreground">Target seniority</dt>
          <dd className="text-body text-copy">{profile?.targetSeniority || "Not set"}</dd>
        </div>
        <div className="grid gap-1 px-5 py-4 sm:grid-cols-[12rem_1fr] sm:gap-4">
          <dt className="text-small font-semibold text-foreground">Work location</dt>
          <dd className="text-body text-copy">
            {profile?.locationPref ? WORK_MODE_LABEL[profile.locationPref] : "Not set"}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" asChild>
          <Link href="/onboarding/applicant">Back</Link>
        </Button>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <Button type="button" onClick={finish} disabled={!ready || pending} aria-describedby={gaps.length > 0 ? "review-gaps" : undefined}>
            {pending ? "Finishing…" : "Finish"}
          </Button>
          {gaps.length > 0 && (
            <ul id="review-gaps" aria-live="polite" className="space-y-1 text-small text-copy sm:text-right">
              {gaps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
