"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { signUp } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyFieldErrors } from "./form-errors";
import { signUpSchema, type SignUpValues } from "./schemas";

const fieldClass = "h-11 rounded-md px-3";
const fieldsSchema = signUpSchema.omit({ role: true });

export function SignUpForm({ role }: { role: "applicant" | "recruiter" }) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Omit<SignUpValues, "role">>({
    resolver: zodResolver(fieldsSchema),
    defaultValues: { fullName: "", email: "", password: "" },
    mode: "onBlur",
    reValidateMode: "onChange",
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: Omit<SignUpValues, "role">) {
    setFormError(null);
    const result = await signUp({ ...values, role });
    setFormError(applyFieldErrors(form, result));
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      {formError && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-card px-3 py-2 text-small text-destructive">
          {formError}
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          autoComplete="name"
          placeholder="Your name"
          aria-invalid={!!errors.fullName}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
          className={fieldClass}
          {...form.register("fullName")}
        />
        {errors.fullName && (
          <p id="fullName-error" role="alert" className="text-small text-destructive">
            {errors.fullName.message}
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder={role === "recruiter" ? "you@company.com" : "name@example.com"}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : "email-hint"}
          className={fieldClass}
          {...form.register("email")}
        />
        {role === "recruiter" && !errors.email && (
          <p id="email-hint" className="text-small font-normal text-copy">
            Use your work email so we can verify your company.
          </p>
        )}
        {errors.email && (
          <p id="email-error" role="alert" className="text-small text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 10 characters"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "password-error" : undefined}
          className={fieldClass}
          {...form.register("password")}
        />
        {errors.password && (
          <p id="password-error" role="alert" className="text-small text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="mt-1 w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Create account
      </Button>
    </form>
  );
}
