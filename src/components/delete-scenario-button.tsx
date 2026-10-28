"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiRequestError } from "@/lib/api-client";
import { useAuth } from "./auth-provider";

/** Owners and administrators may delete; mirrors the server rule in canDeleteScenario. */
export function useCanDeleteScenario() {
  const { profile, role } = useAuth();
  return (s: { userId: string }) => Boolean(profile) && (s.userId === profile?.uid || role === "ADMIN");
}

/**
 * Trash icon (or labelled button) that confirms, then permanently deletes a
 * scenario. Renders nothing for users who may not delete it.
 */
export function DeleteScenarioButton({
  scenario,
  onDeleted,
  variant = "icon",
}: {
  scenario: { id: string; name: string; userId: string };
  onDeleted: (id: string) => void;
  variant?: "icon" | "button";
}) {
  const canDelete = useCanDeleteScenario();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canDelete(scenario)) return null;

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/scenarios/${encodeURIComponent(scenario.id)}`, { method: "DELETE" });
      toast.success("Scenario deleted", { description: scenario.name });
      setOpen(false);
      onDeleted(scenario.id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not delete the scenario.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete scenario ${scenario.name}`}
          title="Delete scenario"
          onClick={() => setOpen(true)}
        >
          <Trash2 aria-hidden />
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setOpen(true)}>
          <Trash2 aria-hidden />
          Delete
        </Button>
      )}
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this scenario?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground break-words">“{scenario.name}”</span> and its QA notes will be permanently removed. This can’t be undone; the
              deletion is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={confirmDelete}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              Delete scenario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
