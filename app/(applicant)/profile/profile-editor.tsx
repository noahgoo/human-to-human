"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { ApplicantProfile, WorkMode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PreferencesFields } from "@/components/onboarding/preferences-fields";
import { preferencesSchema, toProfilePreferences, type PreferencesInput } from "@/components/onboarding/preferences";
import { LinkedInImportCard } from "@/components/uploads/linkedin-import-card";
import { ResumeCard } from "@/components/uploads/resume-card";
import { clearLinkedIn, savePreferences } from "./actions";

export function ProfileEditor({ profile }: { profile: ApplicantProfile }) {
  const router = useRouter();
  const [linkedinHidden, setLinkedinHidden] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const linkedin = linkedinHidden ? null : profile.linkedin;
  const form = useForm<PreferencesInput>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      targetSeniority: profile.targetSeniority ?? "",
      locationPref: profile.locationPref ?? "",
    },
  });

  async function onSave(values: PreferencesInput) {
    const result = await savePreferences(toProfilePreferences(values));
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Preferences saved");
    router.refresh();
  }

  async function confirmDelete() {
    setDeleting(true);
    const result = await clearLinkedIn();
    setDeleting(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setLinkedinHidden(true);
    setDeleteOpen(false);
    toast.success("LinkedIn data deleted");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {!linkedin && (
        <div role="status" className="rounded-xl border border-warning/30 bg-warning-subtle px-4 py-3 text-body text-warning-fg">
          Re-upload your LinkedIn export to check fit and see connections.
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <LinkedInImportCard
          key={linkedin?.id ?? "none"}
          initial={linkedin}
          onGateChange={(gate) => {
            if (gate === "missing") setLinkedinHidden(true);
            if (gate === "ready") setLinkedinHidden(false);
          }}
        />
        <div className="flex flex-col gap-6">
          <ResumeCard initial={profile.resume} />
          <form onSubmit={form.handleSubmit(onSave)} className="rounded-xl border bg-card p-5 shadow-1 sm:p-6">
            <h2 className="text-body font-semibold text-foreground">Preferences</h2>
            <p className="mt-0.5 mb-4 text-small text-muted-foreground">Used when you browse roles. Nothing here is required.</p>
            <PreferencesFields
              seniority={form.watch("targetSeniority")}
              location={form.watch("locationPref")}
              onSeniority={(value) => form.setValue("targetSeniority", value, { shouldValidate: true })}
              onLocation={(value) => form.setValue("locationPref", value as "" | WorkMode, { shouldValidate: true })}
              seniorityError={form.formState.errors.targetSeniority?.message}
              locationError={form.formState.errors.locationPref?.message}
              idPrefix="profile"
            />
            <Button type="submit" className="mt-4" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Save preferences"}
            </Button>
          </form>
        </div>
      </div>

      {linkedin && (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" className="self-start">
              Delete imported LinkedIn data
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete imported LinkedIn data?</DialogTitle>
              <DialogDescription>
                This removes the export from your profile. Fit checks and connection matches stop until you upload a new one.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={deleting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete data"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
