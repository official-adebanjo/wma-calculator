"use client";

import { clientAuth } from "@/lib/firebase/client";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Authenticated fetch. Throws ApiRequestError on {error} bodies. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
  const user = clientAuth().currentUser;
  if (!user) throw new ApiRequestError(401, "UNAUTHENTICATED", "Sign in required.");
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
  });
  const body = await res.json().catch(() => null);
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as ApiErrorBody).error;
    throw new ApiRequestError(res.status, e.code, e.message, e.details);
  }
  if (!body) throw new ApiRequestError(res.status, "BAD_RESPONSE", "The server returned an unreadable response.");
  return { status: res.status, data: body as T };
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿", text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
