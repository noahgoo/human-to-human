import "server-only";

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return url;
}

export function supabaseSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return key;
}
