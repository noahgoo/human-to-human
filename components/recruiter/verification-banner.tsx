import type { VerificationStatus } from "@/lib/types";

export const SUPPORT_EMAIL = "support@known.dev";
export const SUPPORT_HREF = `mailto:${SUPPORT_EMAIL}`;

export function VerificationBanner({ status }: { status: VerificationStatus | null }) {
  if (!status || status === "verified") return null;

  if (status === "rejected") {
    return (
      <div className="mb-6 rounded-xl border border-destructive/30 bg-card px-4 py-3 text-small text-destructive" role="alert">
        Your company verification was rejected. Contact{" "}
        <a className="font-medium text-link underline underline-offset-2" href={SUPPORT_HREF}>
          support
        </a>{" "}
        if you need help.
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-warning/30 bg-warning-subtle px-4 py-3 text-small text-warning-fg" role="status">
      Your company is pending verification. You can create drafts, but can&apos;t publish or see applicants yet.
    </div>
  );
}
