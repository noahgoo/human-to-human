import { NextResponse, type NextRequest } from "next/server";
import { demoEmail } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";

// /demo?role=applicant|applicant_new|recruiter|recruiter_new|admin|none&next=/path
// Signs into the seeded Supabase user for that persona with the shared DEMO_PASSWORD.
export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role") ?? "applicant";
  const next = req.nextUrl.searchParams.get("next");
  const supabase = await createSupabaseServer();

  if (role === "none") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const email = demoEmail(role);
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) return NextResponse.redirect(new URL("/sign-in?error=demo", req.url));

  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.redirect(new URL("/sign-in?error=demo", req.url));

  // "/" routes to the persona's home (or onboarding) once the new cookies are sent.
  return NextResponse.redirect(new URL(next?.startsWith("/") ? next : "/", req.url));
}
