"use client";

import { onIdTokenChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clientAuth } from "@/lib/firebase/client";
import type { UserProfile } from "@/lib/profile";
import type { Role } from "@/lib/roles";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  role: Role | undefined;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Re-reads /api/me (e.g. after the name was changed). */
  refreshProfile: () => Promise<void>;
  setProfile: (p: UserProfile) => void;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(u: User): Promise<UserProfile | null> {
  const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${await u.getIdToken()}` } });
  return res.ok ? ((await res.json()).user as UserProfile) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onIdTokenChanged(clientAuth(), async (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        setProfile(await fetchProfile(u));
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const signOut = useCallback(() => fbSignOut(clientAuth()), []);
  const refreshProfile = useCallback(async () => {
    const u = clientAuth().currentUser;
    if (u) setProfile(await fetchProfile(u));
  }, []);

  const value = useMemo(
    () => ({ user, profile, role: profile?.role, loading, signOut, refreshProfile, setProfile }),
    [user, profile, loading, signOut, refreshProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
