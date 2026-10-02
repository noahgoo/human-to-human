import "server-only";
import type { ApplicantProfile } from "@/lib/types";
import { db } from "@/lib/mock/db";

export async function getApplicantProfile(userId: string): Promise<ApplicantProfile | null> {
  return db().applicants.find((applicant) => applicant.id === userId) ?? null;
}
