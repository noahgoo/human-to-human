"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { resetPassword } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyFieldErrors } from "./form-errors";
import { passwordSchema, type PasswordValues } from "./schemas";

const fieldClass = "h-11 rounded-md px-3";

export function ResetPasswordForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirm: "" },
    mode: "onBlur",
    reValidateMode: "onChange",
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: PasswordValues) {
    setFormError(null);
    const result = await resetPassword(values);
    const message = applyFieldErrors(form, result);
    if (!result.ok) {
      setFormError(message);
      return;
    }
    toast.success("Password updated. Sign in with your new password.");
    router.push("/sign-in");
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      {formError && (
        <p role="alert" className="text-small text-destructive">
          {formError}
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="password">New password</Label>
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
      <div className="grid gap-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm}
          aria-describedby={errors.confirm ? "confirm-error" : undefined}
          className={fieldClass}
          {...form.register("confirm")}
        />
        {errors.confirm && (
          <p id="confirm-error" role="alert" className="text-small text-destructive">
            {errors.confirm.message}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Update password
      </Button>
    </form>
  );
}
