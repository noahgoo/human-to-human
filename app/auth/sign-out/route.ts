import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

async function signOut(req: NextRequest) {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/sign-in", req.url), 303);
}

export function GET(req: NextRequest) {
  return signOut(req);
}

export function POST(req: NextRequest) {
  return signOut(req);
}
