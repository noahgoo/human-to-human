"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { checkWorkEmailDomain, startCompanyClaim } from "./actions";
import { SUPPORT_HREF } from "@/components/recruiter/verification-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const schema = z.object({
  companyName: z.string().trim().min(2, "Enter your company name.").max(120, "Company name must be 120 characters or fewer."),
  website: z.string().trim().max(200, "Website must be 200 characters or fewer."),
});

type ClaimInput = z.infer<typeof schema>;

type Check = {
  kind: "free_mail" | "has_recruiter" | "magic_link" | "admin_review" | "invalid_website";
  domain: string;
};

export function ClaimForm({ email, initialCheck }: { email: string; initialCheck: Check }) {
  const router = useRouter();
  const [check, setCheck] = useState<Check>(initialCheck);
  const [checking, setChecking] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<ClaimInput>({
    resolver: zodResolver(schema),
    defaultValues: { companyName: "", website: "" },
  });
  const companyName = form.watch("companyName");
  const website = form.watch("website");
  const blocked = check.kind === "free_mail" || check.kind === "has_recruiter" || check.kind === "invalid_website";

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setChecking(true);
      void checkWorkEmailDomain({ companyName, website })
        .then((result) => {
          if (cancelled) return;
          if (result.ok) setCheck(result.data);
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [companyName, website]);

  function onSubmit(values: ClaimInput) {
    if (blocked) return;
    startTransition(async () => {
      const result = await startCompanyClaim(values);
      if (!result.ok) {
        if (result.error.fields) {
          for (const [key, message] of Object.entries(result.error.fields)) {
            form.setError(key as keyof ClaimInput, { message });
          }
        }
        toast.error(result.error.message);
        return;
      }
      router.push(result.data.next);
      router.refresh();
    });
  }

  return (
    <form className="mt-6 flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-1" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-name">Company name</Label>
        <Input
          id="company-name"
          className="h-[38px] rounded-md"
          autoComplete="organization"
          aria-invalid={!!form.formState.errors.companyName}
          aria-describedby="domain-check"
          {...form.register("companyName")}
        />
        {form.formState.errors.companyName && <p className="text-small text-destructive">{form.formState.errors.companyName.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-website">
          Website <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="company-website"
          className="h-[38px] rounded-md"
          placeholder="https://brightforge.io"
          inputMode="url"
          autoComplete="url"
          aria-invalid={!!form.formState.errors.website}
          {...form.register("website")}
        />
        {form.formState.errors.website && <p className="text-small text-destructive">{form.formState.errors.website.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="work-email">Work email</Label>
        <Input id="work-email" value={email} readOnly className="h-[38px] rounded-md bg-muted" />
      </div>
      <div
        id="domain-check"
        aria-live="polite"
        className={cn(
          "rounded-md border px-3 py-2 text-small",
          check.kind === "free_mail" || check.kind === "has_recruiter" || check.kind === "invalid_website"
            ? "border-destructive/30 bg-card text-destructive"
            : check.kind === "admin_review"
              ? "border-warning/30 bg-warning-subtle text-warning-fg"
              : "border-success/20 bg-success-subtle text-success-fg",
        )}
      >
        {checking && <p className="mb-1 text-muted-foreground">Checking domain…</p>}
        <DomainMessage check={check} email={email} />
      </div>
      <Button type="submit" disabled={pending || checking || blocked}>
        {pending ? "Submitting…" : "Continue"}
      </Button>
    </form>
  );
}

function DomainMessage({ check, email }: { check: Check; email: string }) {
  if (check.kind === "free_mail") {
    return (
      <p>
        {check.domain || "This address"} is a personal email domain, so it can&apos;t verify a company. Use a work email — not Gmail, Yahoo,
        Outlook, Hotmail, iCloud, Proton, or AOL.
      </p>
    );
  }
  if (check.kind === "has_recruiter") {
    return (
      <p>
        This company already has a recruiter account.{" "}
        <a className="font-medium text-link underline underline-offset-4" href={SUPPORT_HREF}>
          Contact support
        </a>
      </p>
    );
  }
  if (check.kind === "invalid_website") {
    return <p>Enter a valid website, like https://brightforge.io, or leave it blank.</p>;
  }
  if (check.kind === "admin_review") {
    return <p>We&apos;ll verify {check.domain} with an admin.</p>;
  }
  return <p>New company. We&apos;ll send a link to confirm {email}.</p>;
}
