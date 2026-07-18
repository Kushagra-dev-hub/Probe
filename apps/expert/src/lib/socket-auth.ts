import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getExpertConfig } from "./env.js";

export type AuthedUser = { id: string; email: string | null };

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  const { supabaseUrl, supabaseServiceRoleKey } = getExpertConfig();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabase;
}

/**
 * Resolve a socket handshake token to a user.
 *
 * When Supabase is configured we verify the JWT via the service role. Otherwise
 * (local dev) we fall back to treating the token as a raw user id so the room is
 * still runnable against the seed data — e.g. auth: { token: "seed-interviewer" }.
 */
export async function authenticateToken(token: string | undefined): Promise<AuthedUser | null> {
  if (!token) return null;

  const client = getSupabase();
  if (!client) {
    // Dev fallback: token IS the user id.
    return { id: token, email: null };
  }

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
