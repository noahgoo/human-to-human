// All user-facing terminology. The UI says "credits"; code says `token` (D-35/D-37).

export const BRAND = "NexusPulse";

export const CREDIT = { one: "credit", other: "credits", title: "Credits" } as const;

export function formatCredits(n: number): string {
  return `${n} ${n === 1 ? CREDIT.one : CREDIT.other}`;
}

export const FAIRNESS_NOTICE =
  "Scores are AI-generated estimates to help you prioritise. They can be wrong or incomplete. Review each candidate's resume before you decide. Never reject a candidate on score alone.";

export const ERROR_COPY: Record<string, string> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You don't have access to this page.",
  NOT_FOUND: "We couldn't find that.",
  VALIDATION_FAILED: "Please fix the highlighted fields.",
  CONFLICT: "Something changed. Please refresh and try again.",
  ALREADY_APPLIED: "You've already applied to this job.",
  JOB_NOT_OPEN: "This job is no longer accepting applications.",
  INSUFFICIENT_TOKENS: "You don't have enough credits for this job.",
  IDEMPOTENCY_KEY_REUSED: "Please try submitting again.",
  REPO_NOT_ACCESSIBLE: "We couldn't access that repository. Make sure it's public.",
  RATE_LIMITED: "You're going a bit fast. Try again shortly.",
  INTERNAL: "Something went wrong on our side.",
};

export function errorMessage(code: string): string {
  return ERROR_COPY[code] ?? ERROR_COPY.INTERNAL;
}

export const WORK_MODE_LABEL = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" } as const;

export const REPO_CATEGORY_LABEL = {
  security: "Security",
  organization: "Organization",
  performance: "Performance",
  testing: "Testing",
} as const;
