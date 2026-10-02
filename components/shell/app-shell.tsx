import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { AppSession } from "@/lib/auth/session";
import type { TokenBalance } from "@/lib/types";
import { BrandMark } from "@/components/brand-mark";
import { BRAND } from "@/lib/copy";
import { TokenBalancePill } from "@/components/tokens/token-balance-pill";
import { NavLinks, type NavItem } from "./nav-links";
import { UserMenu } from "./user-menu";

const NAV: Record<string, NavItem[]> = {
  applicant: [
    { href: "/jobs", label: "Jobs" },
    { href: "/applications", label: "My applications" },
    { href: "/profile", label: "Profile" },
  ],
  recruiter: [
    { href: "/recruiter/jobs", label: "Jobs" },
    { href: "/recruiter/jobs/new", label: "Post a job" },
    { href: "/recruiter/company", label: "Company" },
  ],
  admin: [{ href: "/admin/companies", label: "Companies" }],
};

export function AppShell({
  session,
  balance,
  children,
}: {
  session: AppSession;
  balance?: TokenBalance;
  children: React.ReactNode;
}) {
  const nav = session.role ? NAV[session.role] : [];
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 h-16 border-b bg-card">
        <div className="mx-auto flex h-full max-w-[1280px] items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <BrandMark />
            <span className="max-sm:sr-only">{BRAND}</span>
          </Link>
          <NavLinks items={nav} />
          <div className="ml-auto flex items-center gap-3">
            {balance && <TokenBalancePill initialBalance={balance} />}
            <RoleBadge session={session} />
            <UserMenu name={session.fullName} email={session.email} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

function RoleBadge({ session }: { session: AppSession }) {
  if (session.role === "recruiter") {
    return (
      <span className="hidden items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-small md:inline-flex">
        {session.companyName ?? "Recruiter"}
        {session.membershipStatus === "verified" && <BadgeCheck className="size-3.5 text-success" aria-label="Verified" />}
      </span>
    );
  }
  const label = session.role === "admin" ? "Admin" : "Job seeker";
  return <span className="hidden rounded-md border bg-muted px-2 py-0.5 text-small md:inline-flex">{label}</span>;
}
