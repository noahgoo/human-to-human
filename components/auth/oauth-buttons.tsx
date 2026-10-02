"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { continueWithOAuth } from "@/app/(auth)/actions";
import { GoogleIcon, LinkedInIcon } from "./icons";

export function OAuthButtons({
  flow,
  role = "applicant",
}: {
  flow: "sign-in" | "sign-up";
  role?: "applicant" | "recruiter";
}) {
  const [pending, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      const result = await continueWithOAuth({ flow, role });
      if (result && !result.ok) toast.error(result.error.message);
    });
  }

  return (
    <div className="grid gap-3">
      <Button type="button" variant="linkedin" size="lg" className="w-full" disabled={pending} onClick={start}>
        {pending ? <Loader2 className="animate-spin" /> : <LinkedInIcon />}
        Continue with LinkedIn
      </Button>
      <Button type="button" variant="secondary" size="lg" className="w-full" disabled={pending} onClick={start}>
        {pending ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </Button>
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-card px-3 text-small text-muted-foreground">or</span>
      </div>
    </div>
  );
}
