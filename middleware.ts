import { NextResponse, type NextRequest } from "next/server";

// Must match DEMO_ROLE_COOKIE in lib/auth/session.ts. Middleware cannot import that
// module because it is marked server-only.
const DEMO_ROLE_COOKIE = "np_demo_role";

const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/verify-email", "/demo"];

function isPublic(pathname: string) {
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return true;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  const persona = req.cookies.get(DEMO_ROLE_COOKIE)?.value;
  const signedIn = Boolean(persona && persona !== "none");

  if (!signedIn && !isPublic(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
