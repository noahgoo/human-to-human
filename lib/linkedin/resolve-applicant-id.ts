import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Mock onboarding personas may not exist in auth.users; map to a seeded profile in dev. */
const DEV_PROFILE_EMAIL_ALIAS: Record<string, string> = {
  "casey.new@example.com": "noah@example.com",
  "jordan@example.com": "carter@example.com",
};

function lookupEmail(email: string): string {
  if (process.env.NODE_ENV === "production") return email;
  return DEV_PROFILE_EMAIL_ALIAS[email] ?? email;
}

/** Map session email to Supabase profiles.id for LinkedIn imports. */
export async function resolveSupabaseApplicantId(email: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("id")
    .eq("email", lookupEmail(email))
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}
