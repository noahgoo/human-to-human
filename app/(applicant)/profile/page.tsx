import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getApplicantProfile } from "@/lib/data/profile";
import { PageHeader } from "@/components/shared/misc";
import { ProfileEditor } from "./profile-editor";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await requireRole("applicant");
  const stored = await getApplicantProfile(session.userId);
  const profile = stored ?? {
    id: session.userId,
    fullName: session.fullName,
    email: session.email,
    avatarUrl: session.avatarUrl,
    headline: null,
    targetSeniority: null,
    locationPref: null,
    resume: null,
    linkedin: null,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={profile.fullName}
        description={profile.headline ? `${profile.headline} · ${profile.email}` : profile.email}
      />
      <ProfileEditor profile={profile} />
    </div>
  );
}
