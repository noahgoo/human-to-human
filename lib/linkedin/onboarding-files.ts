/** Required LinkedIn CSVs for applicant onboarding. */
export const ONBOARDING_LINKEDIN_FILES = ["Profile", "Positions", "Connections", "Rich_Media"] as const;
export type OnboardingLinkedInFile = (typeof ONBOARDING_LINKEDIN_FILES)[number];

export function onboardingFileFromPath(path: string): OnboardingLinkedInFile | null {
  const base = path.split(/[/\\]/).pop() ?? path;
  if (!/\.csv$/i.test(base)) return null;
  const stem = base.replace(/\.csv$/i, "");
  return ONBOARDING_LINKEDIN_FILES.find((kind) => kind.toLowerCase() === stem.toLowerCase()) ?? null;
}

export function filesPresentLabel(kind: OnboardingLinkedInFile): string {
  return kind === "Rich_Media" ? "Rich_Media.csv" : `${kind}.csv`;
}
