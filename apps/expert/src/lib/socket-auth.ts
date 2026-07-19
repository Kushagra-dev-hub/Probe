import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@probe/db";
import { getExpertConfig } from "./env.js";

export type AuthedUser = { id: string; email: string | null };

const AUTH_SECRET = process.env.AUTH_SECRET || "probe-dev-secret";

function sign(userId: string): string {
  return createHmac("sha256", AUTH_SECRET).update(userId).digest("hex").slice(0, 32);
}

/** Local session token: `probe.<userId>.<hmac>` — issued by /auth/login|signup. */
export function issueLocalToken(userId: string): string {
  return `probe.${userId}.${sign(userId)}`;
}

function verifyLocalToken(token: string): AuthedUser | null {
  if (!token.startsWith("probe.")) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= "probe.".length) return null;
  const userId = token.slice("probe.".length, lastDot);
  const mac = token.slice(lastDot + 1);
  const expected = sign(userId);
  if (mac.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return { id: userId, email: null };
}

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

  // Local signed session token (issued by /auth/signup and /auth/login).
  const local = verifyLocalToken(token);
  if (local) return local;

  // Candidate share-link token: the interview link IS the candidate credential.
  if (token.startsWith("iv_")) {
    const interview = await prisma.interview.findUnique({
      where: { shareToken: token },
      include: { interviewee: { select: { id: true, email: true } } },
    });
    if (!interview) return null;
    return { id: interview.interviewee.id, email: interview.interviewee.email };
  }

  const client = getSupabase();
  if (!client) {
    // Dev fallback: token IS the user id (seed demo tokens).
    return { id: token, email: null };
  }

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
