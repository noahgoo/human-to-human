import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseSecretKey, supabaseUrl } from "@/lib/supabase/config";

let client: SupabaseClient | null = null;

/** Service-role client for server-side writes (bypasses RLS). */
export function supabaseAdmin(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  if (!client) {
    // Node 20 lacks a global WebSocket; Supabase realtime still initializes on createClient.
    const WebSocket = require("ws");
    client = createClient(supabaseUrl(), supabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket },
    });
  }
  return client;
}
