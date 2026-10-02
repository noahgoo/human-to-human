"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyFieldErrors } from "@/components/auth/form-errors";
import { passwordSchema, type PasswordValues } from "@/components/auth/schemas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Role } from "@/lib/types";
import { changePassword, exportMyData } from "./actions";

const fieldClass = "h-11 rounded-md px-3";

export function PasswordCard() {
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
    const result = await changePassword(values);
    const message = applyFieldErrors(form, result);
    if (!result.ok) {
      setFormError(message);
      return;
    }
    form.reset();
    toast.success("Password updated.");
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-h3">Change password</h2>
        <CardDescription>Use at least 10 characters. This demo does not store the new password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(onSubmit)}>
          {formError && (
            <p role="alert" className="text-small text-destructive">
              {formError}
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "new-password-error" : undefined}
              className={fieldClass}
              {...form.register("password")}
            />
            {errors.password && (
              <p id="new-password-error" role="alert" className="text-small text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              aria-describedby={errors.confirm ? "confirm-password-error" : undefined}
              className={fieldClass}
              {...form.register("confirm")}
            />
            {errors.confirm && (
              <p id="confirm-password-error" role="alert" className="text-small text-destructive">
                {errors.confirm.message}
              </p>
            )}
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting && <Loader2 className="animate-spin" />}
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ExportCard({ role }: { role: Role | null }) {
  const [pending, startTransition] = useTransition();
  const description =
    role === "applicant"
      ? "Downloads your profile, applications, and connections. Recruiter-only code reviews are left out."
      : role === "recruiter"
        ? "Downloads your account and company membership. Candidate code reviews are left out."
        : "Downloads your account details.";

  function onExport() {
    startTransition(async () => {
      const result = await exportMyData();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "nexuspulse-data.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data download started.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-h3">Your data</h2>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" disabled={pending} onClick={onExport}>
          {pending && <Loader2 className="animate-spin" />}
          Export my data
        </Button>
      </CardContent>
    </Card>
  );
}

export function DangerZone({ role }: { role: Role | null }) {
  const [confirmation, setConfirmation] = useState("");
  const [open, setOpen] = useState(false);
  const canDelete = confirmation === "DELETE";

  function onDelete() {
    if (!canDelete) return;
    window.location.assign("/auth/sign-out");
  }

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <h2 className="text-h3">Danger zone</h2>
        <CardDescription>Delete account signs you out of this demo.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {role === "applicant" && (
          <p className="text-body text-copy">Deleting removes your resume, LinkedIn import and connections.</p>
        )}
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setConfirmation("");
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="destructive" className="w-full sm:w-auto">
              Delete account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete account</DialogTitle>
              <DialogDescription>
                This signs you out of the demo. Type DELETE to confirm.
                {role === "applicant" ? " Deleting removes your resume, LinkedIn import and connections." : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-delete">Type DELETE</Label>
              <Input
                id="confirm-delete"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                className="h-11 rounded-md px-3"
                aria-describedby="confirm-delete-hint"
              />
              <p id="confirm-delete-hint" className="text-small font-normal text-muted-foreground">
                Enter DELETE in capital letters.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="destructive" disabled={!canDelete} onClick={onDelete}>
                Delete account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
