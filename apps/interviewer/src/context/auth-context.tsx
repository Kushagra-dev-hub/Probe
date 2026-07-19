"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type Me } from "@/lib/api";

export type Session = { access_token: string };

export type AuthUser = {
  id: string;
  name: string;
  email: string | null;
  role: "interviewer" | "interviewee";
};

type AuthResponse = { token: string; user: AuthUser };

type AuthContextValue = {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (email: string, password: string, fullName: string) => Promise<AuthUser>;
  signOut: () => void;
  clearError: () => void;
  /** OAuth is not wired in this build — these stubs surface an error instead. */
  signInWithGoogle: (next?: string | null) => Promise<void>;
  signInWithLinkedIn: (next?: string | null) => Promise<void>;
  /** Password reset is not wired in this build — always throws. */
  resetPassword: (email: string) => Promise<void>;
};

const TOKEN_KEY = "probe-token";

const noopAsync = async () => {};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  error: null,
  signIn: async () => {
    throw new Error("Auth is not ready yet.");
  },
  signUp: async () => {
    throw new Error("Auth is not ready yet.");
  },
  signOut: () => {},
  clearError: () => {},
  signInWithGoogle: noopAsync,
  signInWithLinkedIn: noopAsync,
  resetPassword: async () => {
    throw new Error("Password reset is not available in this build.");
  },
});

/**
 * Auth for the Probe interviewer app, backed by the expert service:
 *   POST /auth/login  { email, password }        -> { token, user }
 *   POST /auth/signup { name, email, password }  -> { token, user }
 *   GET  /me (Bearer token)                      -> profile (session restore)
 *
 * The token is persisted in localStorage under `probe-token`.
 *
 * Dev-token override (kept from the original standalone build): if the URL has
 * `?token=<x>` (e.g. the room deep links `?token=seed-interviewer`), that value is
 * used as the access_token directly and stored, exactly like before. The expert
 * accepts it as a raw user id when Supabase env is unset.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount: URL ?token= wins (dev-token deep links), then localStorage.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const fromUrl = new URLSearchParams(window.location.search).get("token");
      if (fromUrl) window.localStorage.setItem(TOKEN_KEY, fromUrl);
      const token = fromUrl || window.localStorage.getItem(TOKEN_KEY);

      if (!token) {
        setLoading(false);
        return;
      }

      // Set the session immediately so token-driven pages (room, dashboard) can load,
      // then hydrate the profile in the background.
      setSession({ access_token: token });
      try {
        const me = await api.get<Me>("/me", token);
        if (!cancelled) {
          setUser({ id: me.id, name: me.name, email: me.email, role: me.role });
        }
      } catch {
        // Invalid/expired token: drop it unless it came from the URL (dev-token
        // deep links must keep working even if /me hiccups).
        if (!cancelled && !fromUrl) {
          window.localStorage.removeItem(TOKEN_KEY);
          setSession(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyAuth = useCallback((res: AuthResponse) => {
    window.localStorage.setItem(TOKEN_KEY, res.token);
    setSession({ access_token: res.token });
    setUser(res.user);
    setError(null);
    return res.user;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await api.post<AuthResponse>("/auth/login", { email, password });
        return applyAuth(res);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Sign in failed.";
        setError(message);
        throw e;
      }
    },
    [applyAuth]
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      try {
        // Backend returns a token directly — signup auto-logs the user in.
        const res = await api.post<AuthResponse>("/auth/signup", {
          name: fullName,
          email,
          password,
        });
        return applyAuth(res);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Sign up failed.";
        setError(message);
        throw e;
      }
    },
    [applyAuth]
  );

  const signOut = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setUser(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const signInWithGoogle = useCallback(async (_next?: string | null) => {
    setError("OAuth is disabled in this build");
  }, []);

  const signInWithLinkedIn = useCallback(async (_next?: string | null) => {
    setError("OAuth is disabled in this build");
  }, []);

  const resetPassword = useCallback(async (_email: string) => {
    throw new Error("Password reset is not available in this build.");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      error,
      signIn,
      signUp,
      signOut,
      clearError,
      signInWithGoogle,
      signInWithLinkedIn,
      resetPassword,
    }),
    [
      user,
      session,
      loading,
      error,
      signIn,
      signUp,
      signOut,
      clearError,
      signInWithGoogle,
      signInWithLinkedIn,
      resetPassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
