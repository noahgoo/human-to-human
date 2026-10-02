import { requireRole } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("recruiter");
  return <AppShell session={session}>{children}</AppShell>;
}
