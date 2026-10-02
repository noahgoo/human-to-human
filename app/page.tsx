import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/auth/session";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!session.role) redirect("/onboarding/role");
  if (!session.onboarded && session.role !== "admin") redirect(`/onboarding/${session.role}`);
  redirect(ROLE_HOME[session.role]);
}
