import { requireRole } from "@/lib/auth/session";
import { getTokenBalance } from "@/lib/data/tokens";
import { AppShell } from "@/components/shell/app-shell";

export default async function ApplicantLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("applicant");
  const balance = await getTokenBalance(session.userId);
  return (
    <AppShell session={session} balance={balance}>
      {children}
    </AppShell>
  );
}
