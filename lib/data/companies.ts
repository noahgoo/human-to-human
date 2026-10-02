import "server-only";
import type { Company, VerificationStatus } from "@/lib/types";
import { db, delay } from "@/lib/mock/db";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getLiveCompany } from "@/lib/data/live-store";

export type WorkEmailKind = "free_mail" | "has_recruiter" | "magic_link" | "admin_review" | "invalid_website";

export interface WorkEmailInspection {
  kind: WorkEmailKind;
  domain: string;
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : "";
}

export function websiteHost(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProto);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

/** Empty input is allowed. A non-empty value must be a real host. */
export function normalizeWebsite(website: string): { ok: true; value: string | null } | { ok: false } {
  const trimmed = website.trim();
  if (!trimmed) return { ok: true, value: null };
  const host = websiteHost(trimmed);
  if (!host) return { ok: false };
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProto);
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname === "/" ? "" : url.pathname;
    return { ok: true, value: `${url.origin}${path}${url.search}` };
  } catch {
    return { ok: false };
  }
}

function domainsMatch(emailHost: string, siteHost: string): boolean {
  return emailHost === siteHost || siteHost.endsWith(`.${emailHost}`) || emailHost.endsWith(`.${siteHost}`);
}

export function isFreeMailDomain(domain: string): boolean {
  return db().blockedEmailDomains.includes(domain);
}

/** Live hint for recruiter onboarding. Does not write. */
export function inspectWorkEmail(input: { email: string; companyName: string; website: string }): WorkEmailInspection {
  const domain = emailDomain(input.email);
  if (!domain || isFreeMailDomain(domain)) return { kind: "free_mail", domain };

  const store = db();
  const claimedIds = new Set(store.memberships.map((m) => m.companyId));
  const byDomain = store.companies.find(
    (c) => claimedIds.has(c.id) && c.domains.some((d) => d.toLowerCase() === domain),
  );
  if (byDomain) return { kind: "has_recruiter", domain };

  const name = input.companyName.trim().toLowerCase();
  if (name) {
    const byName = store.companies.find((c) => claimedIds.has(c.id) && c.name.trim().toLowerCase() === name);
    if (byName) return { kind: "has_recruiter", domain };
  }

  const website = input.website.trim();
  if (!website) return { kind: "magic_link", domain };
  const host = websiteHost(website);
  if (!host) return { kind: "invalid_website", domain };
  if (domainsMatch(domain, host)) return { kind: "magic_link", domain };
  return { kind: "admin_review", domain };
}

export async function getCompany(companyId: string): Promise<Company | null> {
  if (isSupabaseConfigured()) return getLiveCompany(companyId);
  await delay();
  return db().companies.find((c) => c.id === companyId) ?? null;
}

export function canPublish(membershipStatus: VerificationStatus | null, companyStatus: VerificationStatus | null): boolean {
  return membershipStatus === "verified" && companyStatus === "verified";
}
