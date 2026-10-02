import "server-only";

import { NextResponse } from "next/server";
import { previewEnabled } from "@/lib/api/preview-config";
import { getSession, isDemoMode } from "@/lib/auth/session";

export { PREVIEW_MAX_FILE_BYTES } from "@/lib/api/preview-config";

const MAX_REQUESTS = 10;
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

export async function assertFitPreviewAccess(request: Request): Promise<NextResponse | null> {
  if (!previewEnabled()) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }

  const secret = process.env.FIT_PREVIEW_SECRET?.trim();
  const bearer = request.headers.get("authorization");
  const secretOk = secret && bearer === `Bearer ${secret}`;

  if (!secretOk) {
    const session = await readSessionSafely();
    const recruiterOk =
      session?.role === "recruiter" && session.membershipStatus === "verified" && session.onboarded;
    const adminOk = session?.role === "admin";
    if (!recruiterOk && !adminOk) {
      if (!secret && !isDemoMode()) {
        return NextResponse.json(
          {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Fit preview is not configured. Set FIT_PREVIEW_SECRET or sign in as a verified recruiter.",
            },
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Sign in as a verified recruiter or send Authorization: Bearer FIT_PREVIEW_SECRET." } },
        { status: 401 },
      );
    }
  }

  const ip = clientIp(request);
  const limited = checkRateLimit(ip);
  if (limited) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many preview requests. Try again later." } },
      { status: 429 },
    );
  }
  return null;
}

async function readSessionSafely() {
  try {
    return await getSession();
  } catch {
    return null;
  }
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const times = (hits.get(ip) ?? []).filter((t) => t > windowStart);
  if (times.length >= MAX_REQUESTS) {
    hits.set(ip, times);
    return true;
  }
  times.push(now);
  hits.set(ip, times);
  return false;
}
