"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const COPY: Record<string, string> = {
  verified: "Work email confirmed. You can publish jobs.",
};

export function JobNotice({ notice }: { notice?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!notice || !COPY[notice]) return;
    toast.success(COPY[notice]);
    router.replace("/recruiter/jobs");
  }, [notice, router]);
  return null;
}
