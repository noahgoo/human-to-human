import { z } from "zod";
import type { WorkMode } from "@/lib/types";

export const SENIORITY_OPTIONS = [
  "Internship",
  "Entry level",
  "Mid-level",
  "Senior",
  "Lead / Principal",
  "Manager / Director",
] as const;

export const preferencesSchema = z.object({
  targetSeniority: z.string().trim().max(80, "Keep this under 80 characters."),
  locationPref: z.enum(["", "remote", "hybrid", "onsite"]),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;

export function toProfilePreferences(input: PreferencesInput): {
  targetSeniority: string | null;
  locationPref: WorkMode | null;
} {
  return {
    targetSeniority: input.targetSeniority.trim() ? input.targetSeniority.trim() : null,
    locationPref: input.locationPref === "" ? null : input.locationPref,
  };
}
