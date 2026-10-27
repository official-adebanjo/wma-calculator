"use client";

import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientAuth } from "@/lib/firebase/client";

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/email-already-in-use": "An account already exists for this email.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/popup-closed-by-user": "Sign-in popup was closed.",
  "auth/too-many-requests": "Too many attempts. Try again later.",
};

function LoginForm() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(target);
  }, [loading, user, router, target]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof FirebaseError ? (MESSAGES[e.code] ?? e.message) : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-primary font-mono text-lg font-bold text-primary-foreground">₦</span>
          <div>
            <h1 className="text-lg font-semibold">RFS Loan &amp; Investment Calculator</h1>
            <p className="text-sm text-muted-foreground">Internal QA reference tool</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{mode === "signin" ? "Sign in" : "Create account"}</CardTitle>
            <CardDescription>Use synthetic test data only. Never enter real customer details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                run(() =>
                  mode === "signin"
                    ? signInWithEmailAndPassword(clientAuth(), email, password)
                    : createUserWithEmailAndPassword(clientAuth(), email, password),
                );
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>
            <div className="relative text-center text-xs text-muted-foreground">
              <span className="relative z-10 bg-card px-2">or</span>
              <span className="absolute inset-x-0 top-1/2 border-t" aria-hidden />
            </div>
            <Button variant="outline" className="w-full" disabled={busy} onClick={() => run(() => signInWithPopup(clientAuth(), new GoogleAuthProvider()))}>
              Continue with Google
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {mode === "signin" ? "No account?" : "Already have an account?"}{" "}
              <button type="button" className="font-medium text-primary underline underline-offset-4" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
                {mode === "signin" ? "Create one" : "Sign in"}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
