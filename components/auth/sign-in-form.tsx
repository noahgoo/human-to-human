"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { signIn } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyFieldErrors } from "./form-errors";
import { signInSchema, type SignInValues } from "./schemas";

const fieldClass = "h-11 rounded-md px-3";

export function SignInForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
    reValidateMode: "onChange",
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: SignInValues) {
    setFormError(null);
    const result = await signIn(values);
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
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          className={fieldClass}
          {...form.register("email")}
        />
        {errors.email && (
          <p id="email-error" role="alert" className="text-small text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-small text-link outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
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
        Sign in
      </Button>
    </form>
  );
}
