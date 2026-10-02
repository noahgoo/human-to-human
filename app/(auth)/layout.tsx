import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth/session";
import { ValuePanel } from "@/components/auth/value-panel";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const pathname = (await headers()).get("x-pathname") ?? "";
  const stayForVerify = pathname === "/verify-email" || pathname.startsWith("/verify-email/");
  if (session && !stayForVerify) redirect(homeFor(session));

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-3 sm:p-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-xl border bg-card shadow-3 lg:grid-cols-12">
        <ValuePanel />
        <div className="flex flex-col justify-center p-5 sm:p-8 lg:col-span-7 lg:p-12">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
