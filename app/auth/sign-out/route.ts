import { NextResponse, type NextRequest } from "next/server";
import { DEMO_ROLE_COOKIE } from "@/lib/auth/session";

function signOut(req: NextRequest) {
  const response = NextResponse.redirect(new URL("/sign-in", req.url), 303);
  response.cookies.set(DEMO_ROLE_COOKIE, "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
  });
  return response;
}

export function GET(req: NextRequest) {
  return signOut(req);
}

export function POST(req: NextRequest) {
  return signOut(req);
}
