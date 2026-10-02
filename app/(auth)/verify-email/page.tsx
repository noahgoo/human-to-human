import type { Metadata } from "next";
import { VerifyEmailPanel } from "@/components/auth/verify-email-panel";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return <VerifyEmailPanel email={typeof email === "string" ? email : ""} />;
}
