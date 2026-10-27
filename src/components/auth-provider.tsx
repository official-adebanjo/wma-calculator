"use client";

import { onIdTokenChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clientAuth } from "@/lib/firebase/client";
import type { Role } from "@/lib/roles";

interface AuthState {
  user: User | null;
  role: Role | undefined;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onIdTokenChanged(clientAuth(), async (u) => {
      setUser(u);
      if (!u) {
        setRole(undefined);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${await u.getIdToken()}` } });
        if (res.ok) setRole((await res.json()).user.role);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const signOut = useCallback(() => fbSignOut(clientAuth()), []);
  const value = useMemo(() => ({ user, role, loading, signOut }), [user, role, loading, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
