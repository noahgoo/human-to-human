import { NextResponse, type NextRequest } from "next/server";
import { DEMO_ROLE_COOKIE, isDemoMode } from "@/lib/auth/session";

// Demo-mode only: /demo?role=applicant|recruiter|admin|none sets the mock session.
export async function GET(req: NextRequest) {
  if (!isDemoMode()) return NextResponse.redirect(new URL("/sign-in", req.url));
  const role = req.nextUrl.searchParams.get("role") ?? "applicant";
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const res = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", req.url));
  res.cookies.set(DEMO_ROLE_COOKIE, role, { path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}
