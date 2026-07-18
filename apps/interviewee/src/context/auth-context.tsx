"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Session = { access_token: string };

type AuthContextValue = { session: Session | null };

const AuthContext = createContext<AuthContextValue>({ session: null });

/**
 * Lightweight auth for the standalone rebuild.
 *
 * With no real Supabase login wired yet, the token is resolved from (in order):
 *  1. `?token=` in the URL,
 *  2. localStorage `probe-token`,
 *  3. the dev default `seed-interviewee` (matches the seed script + expert dev-token fallback).
 *
 * The expert socket accepts this token as a raw user id when Supabase env is unset.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string>("seed-interviewee");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("token");
    const stored = window.localStorage.getItem("probe-token");
    const resolved = fromUrl || stored || "seed-interviewee";
    if (fromUrl) window.localStorage.setItem("probe-token", fromUrl);
    setToken(resolved);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ session: { access_token: token } }), [token]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
