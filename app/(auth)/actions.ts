"use server";

import { redirect } from "next/navigation";
import { flattenError, type ZodError } from "zod";
import { getSession, homeFor } from "@/lib/auth/session";
import { admin } from "@/lib/supabase/admin";
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

function emailNotConfirmed(error: { code?: string; message: string }): boolean {
  return error.code === "email_not_confirmed" || /not confirmed/i.test(error.message);
}

/** Demo sign-up skips the inbox. Confirm the address, then sign in with the password they just chose. */
async function confirmEmail(userId: string): Promise<string | null> {
  const { error } = await admin().auth.admin.updateUserById(userId, { email_confirm: true });
  return error?.message ?? null;
}

async function userIdForEmail(email: string): Promise<string | null> {
  const { data } = await admin().from("profiles").select("id").eq("email", email).maybeSingle();
  return data?.id ?? null;
}

/** The auth trigger normally inserts this. Create it if that row is missing so `/` can route into onboarding. */
async function ensureProfile(
  userId: string,
  email: string,
  fullName: string,
  role: "applicant" | "recruiter",
): Promise<string | null> {
  const db = admin();
  const { data: profile, error: readError } = await db.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (readError) return readError.message;
  if (!profile) {
    const { error } = await db.from("profiles").insert({
      id: userId,
      email,
      full_name: fullName,
      role,
    });
    if (error) return error.message;
  }
  if (role !== "applicant") return null;
  const { error } = await db.from("applicant_profiles").upsert({ profile_id: userId }, { onConflict: "profile_id", ignoreDuplicates: true });
  return error?.message ?? null;
}

export async function signIn(input: SignInValues): Promise<ActionResult<null>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createSupabaseServer();
  const first = await supabase.auth.signInWithPassword(parsed.data);
  if (first.error && emailNotConfirmed(first.error)) {
    const userId = await userIdForEmail(parsed.data.email);
    if (userId) {
      const confirmError = await confirmEmail(userId);
      if (confirmError) return fail("INTERNAL", confirmError);
      const retry = await supabase.auth.signInWithPassword(parsed.data);
      if (!retry.error) redirect("/");
    }
  }
  if (first.error) return fail("UNAUTHENTICATED", "That email and password don't match an account.");
  redirect("/");
}

export async function signUp(input: SignUpValues): Promise<ActionResult<null>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  // Admin create skips the confirmation email (that send is rate-limited) and marks the address confirmed.
  // The verify screen still shows so the requirement is visible; Continue enters onboarding.
  const { data, error } = await admin().auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName, role: parsed.data.role },
  });
  const taken = error?.code === "email_exists" || error?.code === "user_already_exists" || /already been registered/i.test(error?.message ?? "");
  if (taken) return fail("CONFLICT", "An account with that email already exists. Sign in instead.");
  if (error || !data.user) return fail("INTERNAL", error?.message ?? "Could not create the account.");

  const supabase = await createSupabaseServer();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (signInError) return fail("UNAUTHENTICATED", "Account created, but sign-in failed. Try signing in.");

  const profileError = await ensureProfile(data.user.id, parsed.data.email, parsed.data.fullName, parsed.data.role);
  if (profileError) return fail("INTERNAL", profileError);
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

export async function continueAfterVerify(email?: string): Promise<ActionResult<null>> {
  const session = await getSession();
  if (session) return goHome();

  const trimmed = email?.trim();
  if (!trimmed) redirect("/sign-in");
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email: trimmed });
  if (error || !data.properties?.hashed_token) redirect("/sign-in");

  const supabase = await createSupabaseServer();
  const { error: otpError } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (otpError) redirect("/sign-in");
  redirect("/");
}
