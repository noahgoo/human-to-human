import { NextResponse, type NextRequest } from "next/server";
import { DEMO_ROLE_COOKIE } from "@/lib/auth/session";

// /demo?role=applicant|applicant_new|bobby|recruiter|recruiter_new|admin|none&next=/path
export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role") ?? "applicant";
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const res = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", req.url));
  res.cookies.set(DEMO_ROLE_COOKIE, role, { path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}
