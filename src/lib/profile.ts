import { z } from "zod";
import type { Role } from "./roles";

/** Letters (any script), spaces, apostrophes, hyphens and dots; 1–60 chars. */
const namePart = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(60, `${label} must be at most 60 characters.`)
    .regex(/^\p{L}[\p{L}\p{M}' .-]*$/u, `${label} may contain letters, spaces, apostrophes and hyphens only.`);

export const profileNameSchema = z.object({
  firstName: namePart("First name"),
  lastName: namePart("Last name"),
});

export type ProfileNameInput = z.infer<typeof profileNameSchema>;

export interface UserProfile {
  uid: string;
  email: string | null;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  /** "First Last" when known, otherwise the email, otherwise the uid. */
  displayName: string;
}

export function fullName(firstName?: string | null, lastName?: string | null): string | null {
  const n = [firstName, lastName].filter(Boolean).join(" ").trim();
  return n || null;
}

/** Splits a provider display name ("Ada Lovelace-Byron") into first/last parts. */
export function splitName(name?: string | null): { firstName: string; lastName: string } | null {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function initials(displayName: string): string {
  const parts = displayName.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Name for display on records that may predate profile names. */
export function personLabel(r: { userName?: string | null; userEmail?: string | null; userId?: string }): string {
  return r.userName || r.userEmail || r.userId || "Unknown";
}
