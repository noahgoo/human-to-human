"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resendWorkEmailVerification } from "./actions";

export function ResendButton({ initialSeconds = 60 }: { initialSeconds?: number }) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = setInterval(() => setSeconds((current) => (current > 0 ? current - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  function resend() {
    startTransition(async () => {
      const result = await resendWorkEmailVerification();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setSeconds(60);
      toast.success("Confirmation link sent again.");
    });
  }

  return (
    <Button type="button" variant="secondary" disabled={seconds > 0 || pending} onClick={resend}>
      {seconds > 0 ? `Resend in ${seconds}s` : pending ? "Sending…" : "Resend"}
    </Button>
  );
}
