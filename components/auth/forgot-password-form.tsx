"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { requestPasswordReset } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyFieldErrors } from "./form-errors";
import { emailSchema, type EmailValues } from "./schemas";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
    mode: "onBlur",
    reValidateMode: "onChange",
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: EmailValues) {
    setFormError(null);
    const result = await requestPasswordReset(values);
    const message = applyFieldErrors(form, result);
    if (result.ok) setSentTo(values.email);
    else setFormError(message);
  }

  if (sentTo) {
    return (
      <div className="grid gap-4">
        <div className="flex size-10 items-center justify-center rounded-md bg-success-subtle text-success-fg">
          <Mail className="size-5" aria-hidden />
        </div>
        <div>
          <h2 className="text-h2">Check your inbox</h2>
          <p className="mt-2 text-body text-copy">
            We sent password reset instructions to <span className="font-medium text-foreground">{sentTo}</span>.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
        <Link href="/sign-in" className="text-center text-small text-link outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <h2 className="text-h2">Forgot password</h2>
        <p className="mt-1 text-body text-copy">Enter your email and we&apos;ll send a reset link.</p>
      </header>
      <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      {formError && (
        <p role="alert" className="text-small text-destructive">
          {formError}
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          className="h-11 rounded-md px-3"
          {...form.register("email")}
        />
        {errors.email && (
          <p id="email-error" role="alert" className="text-small text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Send reset link
      </Button>
      <p className="text-center text-body text-copy">
        <Link href="/sign-in" className="font-semibold text-link outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
          Back to sign in
        </Link>
      </p>
    </form>
    </div>
  );
}
