"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { continueAfterVerify } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function VerifyEmailPanel({ email }: { email: string }) {
  const [seconds, setSeconds] = useState(60);
  const [pending, startTransition] = useTransition();
  const destination = email || "your email";

  useEffect(() => {
    const id = window.setInterval(() => {
      setSeconds((current) => (current <= 0 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  function resend() {
    if (seconds > 0) return;
    setSeconds(60);
    toast.success(`We sent another link to ${destination}.`);
  }

  function continueDemo() {
    startTransition(async () => {
      const result = await continueAfterVerify(email);
      if (result && !result.ok) toast.error(result.error.message);
    });
  }

  return (
    <div className="grid gap-5">
      <div className="flex size-10 items-center justify-center rounded-md bg-token-subtle text-token-fg">
        <Mail className="size-5" aria-hidden />
      </div>
      <div>
        <h2 className="text-h2">Check your email</h2>
        <p className="mt-2 text-body text-copy">
          We sent a link to <span className="font-medium text-foreground">{destination}</span>.
        </p>
        <p className="mt-3 text-body text-copy">
          Didn&apos;t get it?{" "}
          <button
            type="button"
            className="font-semibold text-link outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 disabled:text-muted-foreground disabled:no-underline"
            disabled={seconds > 0}
            onClick={resend}
          >
            {seconds > 0 ? `Resend in ${seconds}s` : "Resend"}
          </button>
        </p>
      </div>
      <Button type="button" size="lg" className="w-full" disabled={pending} onClick={continueDemo}>
        {pending && <Loader2 className="animate-spin" />}
        Continue (demo: email verified)
      </Button>
    </div>
  );
}
