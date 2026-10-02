"use server";

import { redirect } from "next/navigation";
import { flattenError, type ZodError } from "zod";
import { getSession, homeFor } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/copy";
import type { ActionResult } from "@/lib/types";
import { emailSchema, passwordSchema, signInSchema, signUpSchema, type EmailValues, type PasswordValues, type SignInValues, type SignUpValues } from "@/components/auth/schemas";

function validationFailure(error: ZodError): ActionResult<null> {
  const flat = flattenError(error);
  const fields: Record<string, string> = {};
  for (const [key, messages] of Object.entries(flat.fieldErrors)) {
    const message = Array.isArray(messages) ? messages.find((item) => typeof item === "string") : undefined;
    if (message) fields[key] = message;
  }
  return {
    ok: false,
    error: {
      code: "VALIDATION_FAILED",
      message: errorMessage("VALIDATION_FAILED"),
      fields: Object.keys(fields).length ? fields : undefined,
    },
  };
}

function fail(code: string, message: string): ActionResult<null> {
  return { ok: false, error: { code, message } };
}

function appUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${path}`;
}

async function goHome(): Promise<never> {
  const session = await getSession();
  redirect(session ? homeFor(session) : "/");
}

export async function signIn(input: SignInValues): Promise<ActionResult<null>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return fail("UNAUTHENTICATED", "That email and password don't match an account.");
  redirect("/");
}

export async function signUp(input: SignUpValues): Promise<ActionResult<null>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, role: parsed.data.role },
      emailRedirectTo: appUrl("/auth/callback"),
    },
  });
  if (error) return fail(error.code === "user_already_exists" ? "CONFLICT" : "INTERNAL", error.message);
  // Email confirmation off: signed in already. On: wait for the link.
  if (data.session) redirect("/");
  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function continueWithOAuth(input: {
  flow: "sign-in" | "sign-up";
  role?: "applicant" | "recruiter";
}): Promise<ActionResult<null>> {
  const persona =
    input.flow === "sign-up" ? (input.role === "recruiter" ? "recruiter_new" : "applicant_new") : "applicant";
  // No OAuth provider is configured yet, so this signs into the matching demo persona.
  redirect(`/demo?role=${persona}`);
}

export async function requestPasswordReset(input: EmailValues): Promise<ActionResult<null>> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: appUrl("/auth/callback?next=/reset-password"),
  });
  if (error) return fail("INTERNAL", error.message);
  return { ok: true, data: null };
}

export async function resetPassword(input: PasswordValues): Promise<ActionResult<null>> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail("UNAUTHENTICATED", "Your reset link expired. Request a new one.");
  return { ok: true, data: null };
}

export async function continueAfterVerify(): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return goHome();
}
