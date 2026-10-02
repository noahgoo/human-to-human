// Session contract used by every layout and page. The auth agent owns the
// implementation; the exported names and the AppSession shape are stable.
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, VerificationStatus } from "@/lib/types";
import { DEMO_APPLICANT_ID, DEMO_RECRUITER_COMPANY_ID, DEMO_RECRUITER_ID } from "@/lib/mock/db";

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
  /** True when running without Supabase env (mock auth). */
  isDemo: boolean;
}

export const DEMO_ROLE_COOKIE = "np_demo_role";

export function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

async function getDemoSession(): Promise<AppSession | null> {
  const store = await cookies();
  const role = store.get(DEMO_ROLE_COOKIE)?.value as Role | "none" | undefined;
  if (!role || role === "none") return null;
  if (role === "recruiter") {
    return {
      userId: DEMO_RECRUITER_ID, email: "priya@lumenlabs.dev", fullName: "Priya Shah", avatarUrl: null,
      role, onboarded: true, membershipStatus: "verified", companyId: DEMO_RECRUITER_COMPANY_ID, companyName: "Lumen Labs", isDemo: true,
    };
  }
  if (role === "admin") {
    return {
      userId: "user-admin-demo", email: "admin@nexuspulse.dev", fullName: "Admin", avatarUrl: null,
      role, onboarded: true, membershipStatus: null, companyId: null, companyName: null, isDemo: true,
    };
  }
  return {
    userId: DEMO_APPLICANT_ID, email: "jordan@example.com", fullName: "Jordan Lee", avatarUrl: null,
    role: "applicant", onboarded: true, membershipStatus: null, companyId: null, companyName: null, isDemo: true,
  };
}

export async function getSession(): Promise<AppSession | null> {
  if (isDemoMode()) return getDemoSession();
  // TODO(auth agent): read the Supabase session + profiles row.
  return null;
}

export const ROLE_HOME: Record<Role, string> = {
  applicant: "/jobs",
  recruiter: "/recruiter/jobs",
  admin: "/admin/companies",
};

export async function requireUser(): Promise<AppSession> {
  const s = await getSession();
  if (!s) redirect("/sign-in");
  return s;
}

export async function requireRole(role: Role): Promise<AppSession> {
  const s = await requireUser();
  if (!s.role) redirect("/onboarding/role");
  if (s.role !== role) redirect(ROLE_HOME[s.role]);
  if (!s.onboarded && role !== "admin") redirect(`/onboarding/${role}`);
  return s;
}
