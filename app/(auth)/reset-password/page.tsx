import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <div>
      <header className="mb-6">
        <h2 className="text-h2">Reset password</h2>
        <p className="mt-1 text-body text-copy">Choose a new password with at least 10 characters.</p>
      </header>
      <ResetPasswordForm />
      <Link
        href="/sign-in"
        className="mt-6 inline-flex text-small text-link outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Back to sign in
      </Link>
    </div>
  );
}
