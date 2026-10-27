"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiRequestError } from "@/lib/api-client";
import { profileNameSchema, type UserProfile } from "@/lib/profile";
import { useAuth } from "./auth-provider";

/**
 * Collects or edits the user's first and last name. When `required`, the
 * dialog cannot be dismissed until a valid name is saved.
 */
export function ProfileNameDialog({ open, onOpenChange, required = false }: { open: boolean; onOpenChange: (o: boolean) => void; required?: boolean }) {
  const { profile, setProfile } = useAuth();
  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [lastName, setLastName] = useState(profile?.lastName ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = profileNameSchema.safeParse({ firstName, lastName });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const { data } = await api<{ user: UserProfile }>("/api/me", { method: "PATCH", body: JSON.stringify(parsed.data) });
      setProfile(data.user);
      toast.success("Name saved");
      onOpenChange(false);
    } catch (err) {
      setErrors({ form: err instanceof ApiRequestError ? err.message : "Could not save your name." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!required || !o ? onOpenChange(o) : undefined)}>
      <DialogContent
        showCloseButton={!required}
        onEscapeKeyDown={(e) => required && e.preventDefault()}
        onInteractOutside={(e) => required && e.preventDefault()}
      >
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{required ? "Add your name" : "Edit your name"}</DialogTitle>
            <DialogDescription>Your name is shown on scenarios, tester notes and the audit log instead of your email address.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["firstName", "First name", firstName, setFirstName, "given-name"],
                ["lastName", "Last name", lastName, setLastName, "family-name"],
              ] as const
            ).map(([key, label, value, set, autoComplete]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`profile-${key}`}>{label}</Label>
                <Input
                  id={`profile-${key}`}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  autoComplete={autoComplete}
                  maxLength={60}
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={errors[key] ? `profile-${key}-error` : undefined}
                  autoFocus={key === "firstName"}
                />
                {errors[key] && (
                  <p id={`profile-${key}-error`} role="alert" className="text-sm font-medium text-destructive">
                    {errors[key]}
                  </p>
                )}
              </div>
            ))}
          </div>
          {errors.form && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errors.form}
            </p>
          )}
          <DialogFooter>
            {!required && (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden />}
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
