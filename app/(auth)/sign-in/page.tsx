import type { Metadata } from "next";
import Link from "next/link";
import { DemoPersonas } from "@/components/auth/demo-personas";
import { OAuthButtons, OrDivider } from "@/components/auth/oauth-buttons";
import { SignInForm } from "@/components/auth/sign-in-form";
import { BRAND } from "@/lib/copy";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div>
      <header className="mb-6">
        <h2 className="text-h2">Sign in</h2>
        <p className="mt-1 text-body text-copy">Welcome back. Access your applications and connections.</p>
      </header>
      <OAuthButtons flow="sign-in" />
      <OrDivider />
      <SignInForm />
      <p className="mt-6 border-t pt-5 text-center text-body text-copy">
        New to {BRAND}?{" "}
        <Link
          href="/sign-up"
          className="font-semibold text-link outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Create an account
        </Link>
      </p>
      <DemoPersonas />
    </div>
  );
}
