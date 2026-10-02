import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth/session";
import { getTokenBalance } from "@/lib/data/tokens";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const balance = session.role === "applicant" ? await getTokenBalance(session.userId) : undefined;
  return (
    <AppShell session={session} balance={balance}>
      {children}
    </AppShell>
  );
}
