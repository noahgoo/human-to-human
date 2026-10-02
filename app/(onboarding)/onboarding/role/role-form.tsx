"use client";

import { useState, useTransition } from "react";
import { Building2, Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { selectRole } from "./actions";

const OPTIONS = [
  {
    value: "applicant" as const,
    title: "Applicant",
    body: "Check your fit, see your connections at each company, and apply with credits.",
    icon: UserRound,
  },
  {
    value: "recruiter" as const,
    title: "Recruiter",
    body: "Use your work email so we can verify your company.",
    icon: Building2,
  },
];

export function RoleForm() {
  const [role, setRole] = useState<"applicant" | "recruiter">("applicant");
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await selectRole(role);
      if (result && !result.ok) toast.error(result.error.message);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <RadioGroup
        value={role}
        onValueChange={(value) => setRole(value as "applicant" | "recruiter")}
        className="grid gap-3 sm:grid-cols-2"
        aria-label="Role"
      >
        {OPTIONS.map((option) => {
          const selected = role === option.value;
          const id = `role-${option.value}`;
          return (
            <Label
              key={option.value}
              htmlFor={id}
              className={cn(
                "relative flex h-full cursor-pointer flex-col items-start gap-3 rounded-xl border bg-card p-5 font-normal shadow-1 outline-none focus-within:ring-3 focus-within:ring-ring/50",
                selected ? "border-border-strong ring-2 ring-ring" : "hover:border-border-strong",
              )}
            >
              <RadioGroupItem id={id} value={option.value} className="absolute top-4 right-4" />
              <option.icon className="size-5" aria-hidden />
              <span className="text-h3">{option.title}</span>
              <span className="text-body text-copy">{option.body}</span>
            </Label>
          );
        })}
      </RadioGroup>
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Continue
      </Button>
    </form>
  );
}
