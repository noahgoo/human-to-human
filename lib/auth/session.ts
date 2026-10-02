// Session for every layout, page and server action. Identity comes from Supabase Auth
// (cookie session); profile and membership rows are read with the secret-key client.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role, VerificationStatus } from "@/lib/types";
import { admin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { profiles as seedProfiles, DEMO_ADMIN_ID, DEMO_APPLICANT_ID, DEMO_NEW_APPLICANT_ID, DEMO_NEW_RECRUITER_ID, DEMO_RECRUITER_ID } from "@/lib/mock/seed";

export interface AppSession {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: Role | null;
  onboarded: boolean;
  /** Recruiters only. */
  membershipStatus: VerificationStatus | null;
  companyId: string | null;
  companyName: string | null;
}

/** One-click demo sign-in (/demo?role=…). Each persona is a seeded Supabase user. */
export type DemoPersona = "applicant" | "applicant_new" | "recruiter" | "recruiter_new" | "admin";

const PERSONA_SEED_ID: Record<DemoPersona, string> = {
  applicant: DEMO_APPLICANT_ID,
  applicant_new: DEMO_NEW_APPLICANT_ID,
  recruiter: DEMO_RECRUITER_ID,
  recruiter_new: DEMO_NEW_RECRUITER_ID,
  admin: DEMO_ADMIN_ID,
};

export function demoEmail(persona: string): string | null {
  if (!(persona in PERSONA_SEED_ID)) return null;
  return seedProfiles.find((p) => p.id === PERSONA_SEED_ID[persona as DemoPersona])?.email ?? null;
}

/** True until Supabase env vars are set. */
export function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

export const getSession = cache(async (): Promise<AppSession | null> => {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const db = admin();
  const [{ data: profile }, { data: membership }] = await Promise.all([
    db.from("profiles").select("id, email, full_name, avatar_url, role, onboarded_at").eq("id", userId).maybeSingle(),
    db
      .from("recruiter_memberships")
      .select("verification_status, company_id, company:companies(name)")
      .eq("profile_id", userId)
      .neq("verification_status", "rejected")
      .maybeSingle(),
  ]);
  if (!profile) return null;

  const role = (profile.role as Role | null) ?? null;
  const company = (membership?.company as { name: string } | null | undefined) ?? null;
  return {
    userId,
    email: profile.email,
    fullName: profile.full_name ?? profile.email,
    avatarUrl: profile.avatar_url,
    role,
    onboarded: role === "admin" || profile.onboarded_at != null,
    membershipStatus: role === "recruiter" ? ((membership?.verification_status as VerificationStatus | undefined) ?? null) : null,
    companyId: role === "recruiter" ? (membership?.company_id ?? null) : null,
    companyName: role === "recruiter" ? (company?.name ?? null) : null,
  };
});

export const ROLE_HOME: Record<Role, string> = {
  applicant: "/jobs",
  recruiter: "/recruiter/jobs",
  admin: "/admin/companies",
};

export function homeFor(s: AppSession): string {
  if (!s.role) return "/onboarding/role";
  if (!s.onboarded) return `/onboarding/${s.role}`;
  return ROLE_HOME[s.role];
}

export async function requireUser(): Promise<AppSession> {
  const s = await getSession();
  if (!s) redirect("/sign-in");
  return s;
}

/** For app pages: wrong role or not onboarded redirects to the right place. */
export async function requireRole(role: Role): Promise<AppSession> {
  const s = await requireUser();
  if (s.role !== role || (!s.onboarded && role !== "admin")) redirect(homeFor(s));
  return s;
}

/** For onboarding pages: must have this role and NOT be onboarded yet. */
export async function requireOnboarding(role: Exclude<Role, "admin">): Promise<AppSession> {
  const s = await requireUser();
  if (s.role !== role || s.onboarded) redirect(homeFor(s));
  return s;
}

/** Call from a server action when onboarding finishes. */
export async function markOnboarded(userId: string): Promise<void> {
  const { error } = await admin().from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", userId).is("onboarded_at", null);
  if (error) throw new Error(`markOnboarded: ${error.message}`);
}
