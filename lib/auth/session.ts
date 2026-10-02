// Mock session for the UI-only MVP. Every layout and page uses these exports; a real
// Supabase implementation can replace the bodies later without changing call sites.
//
// The demo cookie `np_demo_role` selects the persona:
//   applicant      Jordan Lee, onboarded, has applications
//   applicant_new  fresh applicant, goes through /onboarding/applicant
//   recruiter      Priya Shah, verified recruiter at Lumen Labs
//   recruiter_new  fresh recruiter, goes through /onboarding/recruiter
//   admin          platform admin
//   none / unset   signed out
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, VerificationStatus } from "@/lib/types";
import {
  db,
  DEMO_APPLICANT_ID,
  DEMO_NEW_APPLICANT_ID,
  DEMO_NEW_RECRUITER_ID,
  DEMO_RECRUITER_ID,
} from "@/lib/mock/db";

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

export const DEMO_ROLE_COOKIE = "np_demo_role";
export type DemoPersona = "applicant" | "applicant_new" | "recruiter" | "recruiter_new" | "admin" | "none";

const PERSONAS: Record<Exclude<DemoPersona, "none">, { userId: string; email: string; fullName: string; role: Role | null }> = {
  applicant: { userId: DEMO_APPLICANT_ID, email: "jordan@example.com", fullName: "Jordan Lee", role: "applicant" },
  applicant_new: { userId: DEMO_NEW_APPLICANT_ID, email: "casey.new@example.com", fullName: "Casey Rivera", role: "applicant" },
  recruiter: { userId: DEMO_RECRUITER_ID, email: "priya@lumenlabs.dev", fullName: "Priya Shah", role: "recruiter" },
  recruiter_new: { userId: DEMO_NEW_RECRUITER_ID, email: "sam@brightforge.io", fullName: "Sam Okoro", role: "recruiter" },
  admin: { userId: "user-admin-demo", email: "admin@nexuspulse.dev", fullName: "Admin", role: "admin" },
};

export async function getSession(): Promise<AppSession | null> {
  const store = await cookies();
  const persona = store.get(DEMO_ROLE_COOKIE)?.value as DemoPersona | undefined;
  if (!persona || persona === "none" || !(persona in PERSONAS)) return null;
  const p = PERSONAS[persona as Exclude<DemoPersona, "none">];
  const mock = db();
  const membership = p.role === "recruiter" ? mock.memberships.find((m) => m.recruiterId === p.userId) : undefined;
  const company = membership ? mock.companies.find((c) => c.id === membership.companyId) : undefined;
  return {
    userId: p.userId,
    email: p.email,
    fullName: p.fullName,
    avatarUrl: null,
    role: p.role,
    onboarded: p.role === "admin" || mock.onboardedUserIds.includes(p.userId),
    membershipStatus: membership?.verificationStatus ?? null,
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
  };
}

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
  const mock = db();
  if (!mock.onboardedUserIds.includes(userId)) mock.onboardedUserIds.push(userId);
}
