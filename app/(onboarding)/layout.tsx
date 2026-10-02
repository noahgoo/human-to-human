import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { BRAND } from "@/lib/copy";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 h-16 border-b bg-card">
        <div className="mx-auto flex h-full max-w-[1100px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-small font-bold text-primary-foreground">
              N
            </span>
            <span>{BRAND}</span>
          </Link>
          <form action="/auth/sign-out" method="post">
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
