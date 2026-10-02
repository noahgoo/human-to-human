"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { flattenError, type ZodError } from "zod";
import { DEMO_ROLE_COOKIE, getSession, homeFor, type DemoPersona } from "@/lib/auth/session";
import { errorMessage } from "@/lib/copy";
import type { ActionResult } from "@/lib/types";
import { emailSchema, passwordSchema, signInSchema, signUpSchema, type EmailValues, type PasswordValues, type SignInValues, type SignUpValues } from "@/components/auth/schemas";

const COOKIE = { httpOnly: true, path: "/", sameSite: "lax" as const };

const FALLBACK_HOME: Record<Exclude<DemoPersona, "none">, string> = {
  applicant: "/jobs",
  applicant_new: "/onboarding/applicant",
  recruiter: "/recruiter/jobs",
  recruiter_new: "/onboarding/recruiter",
  admin: "/admin/companies",
};

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

function personaFromEmail(email: string): Exclude<DemoPersona, "none" | "applicant_new" | "recruiter_new"> {
  const value = email.toLowerCase();
  if (value.includes("admin")) return "admin";
  if (value.includes("recruit") || value.includes("priya")) return "recruiter";
  return "applicant";
}

async function enterPersona(persona: Exclude<DemoPersona, "none">): Promise<void> {
  const jar = await cookies();
  jar.set(DEMO_ROLE_COOKIE, persona, COOKIE);
  const session = await getSession();
  redirect(session ? homeFor(session) : FALLBACK_HOME[persona]);
}

export async function signIn(input: SignInValues): Promise<ActionResult<null>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  await enterPersona(personaFromEmail(parsed.data.email));
  return { ok: true, data: null };
}

export async function signUp(input: SignUpValues): Promise<ActionResult<null>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const persona = parsed.data.role === "recruiter" ? "recruiter_new" : "applicant_new";
  const jar = await cookies();
  jar.set(DEMO_ROLE_COOKIE, persona, COOKIE);
  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
  return { ok: true, data: null };
}

export async function continueWithOAuth(input: {
  flow: "sign-in" | "sign-up";
  role?: "applicant" | "recruiter";
}): Promise<ActionResult<null>> {
  const persona =
    input.flow === "sign-up" ? (input.role === "recruiter" ? "recruiter_new" : "applicant_new") : "applicant";
  await enterPersona(persona);
  return { ok: true, data: null };
}

export async function requestPasswordReset(input: EmailValues): Promise<ActionResult<null>> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  return { ok: true, data: null };
}

export async function resetPassword(input: PasswordValues): Promise<ActionResult<null>> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  return { ok: true, data: null };
}

export async function continueAfterVerify(): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  redirect(homeFor(session));
  return { ok: true, data: null };
}
