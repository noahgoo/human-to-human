import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/misc";
import { requireUser } from "@/lib/auth/session";
import type { Role } from "@/lib/types";
import { DangerZone, ExportCard, PasswordCard } from "./settings-client";

export const metadata: Metadata = { title: "Settings · NexusPulse" };

function roleLabel(role: Role | null) {
  if (role === "recruiter") return "Recruiter";
  if (role === "admin") return "Admin";
  if (role === "applicant") return "Job seeker";
  return "Not set";
}

export default async function SettingsPage() {
  const session = await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title="Settings" description="Manage your account." />
      <Card>
        <CardHeader>
          <h2 className="text-h3">Account</h2>
          <CardDescription>These details come from your demo persona.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="account-name">Full name</Label>
            <Input id="account-name" value={session.fullName} readOnly aria-readonly="true" className="h-11 rounded-md bg-muted px-3" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="account-email">Email</Label>
            <Input
              id="account-email"
              type="email"
              value={session.email}
              readOnly
              aria-readonly="true"
              className="h-11 rounded-md bg-muted px-3"
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium" id="account-role-label">
              Role
            </span>
            <div className="flex flex-wrap items-center gap-2" aria-labelledby="account-role-label">
              <Badge variant="outline">{roleLabel(session.role)}</Badge>
              <span className="text-small font-normal text-copy">Your role can&apos;t be changed</span>
            </div>
          </div>
          <form action="/auth/sign-out" method="post">
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
      <PasswordCard />
      <ExportCard role={session.role} />
      <DangerZone role={session.role} />
    </div>
  );
}
