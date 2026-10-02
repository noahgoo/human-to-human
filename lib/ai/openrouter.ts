import "server-only";
import { BRAND } from "@/lib/copy";

export function openRouterHeaders(): HeadersInit {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return {
    "HTTP-Referer": origin,
    "X-Title": BRAND,
  };
}
