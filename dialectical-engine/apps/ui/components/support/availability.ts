import { useEffect, useSyncExternalStore } from "react";

export const SUPPORT_OFFERED_STORAGE_KEY = "debateai.support.offered.v1";
export type SupportOfferedState = "unknown" | "offered" | "not-offered" | "failed";

let state: SupportOfferedState = "unknown";
let pending: Promise<void> | null = null;
let persisted = false;
let generation = 0;
const listeners = new Set<() => void>();

function publish(next: SupportOfferedState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // A failed check, or an answer that could not be stored, is only a page answer.
    if (listeners.size === 0 && !persisted) {
      generation += 1;
      pending = null;
      state = "unknown";
    }
  };
}

const snapshot = (): SupportOfferedState => state;
const serverSnapshot = (): SupportOfferedState => "unknown";

function storedAnswer(): boolean | null {
  try {
    const value = sessionStorage.getItem(SUPPORT_OFFERED_STORAGE_KEY);
    return value === "true" ? true : value === "false" ? false : null;
  } catch {
    return null;
  }
}

function keepAnswer(value: boolean): void {
  try {
    sessionStorage.setItem(SUPPORT_OFFERED_STORAGE_KEY, String(value));
    persisted = true;
  } catch {
    persisted = false;
  }
}

function load(): void {
  if (state !== "unknown" || pending !== null) return;
  const kept = storedAnswer();
  if (kept !== null) {
    persisted = true;
    publish(kept ? "offered" : "not-offered");
    return;
  }

  const thisGeneration = generation;
  pending = (async () => {
    try {
      const response = await fetch("/api/v1/geo/availability", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin"
      });
      if (response.status !== 200) throw new Error("AVAILABILITY_UNAVAILABLE");
      const body: unknown = await response.json();
      if (body === null || typeof body !== "object" ||
          typeof (body as Record<string, unknown>).service !== "boolean") {
        throw new Error("AVAILABILITY_INVALID");
      }
      if (generation !== thisGeneration) return;
      const offered = (body as { service: boolean }).service;
      keepAnswer(offered);
      publish(offered ? "offered" : "not-offered");
    } catch {
      if (generation === thisGeneration) publish("failed");
    }
  })();
}

export function useSupportOffered(): SupportOfferedState {
  const offered = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(load, []);
  return offered;
}

export function markSupportNotOffered(): void {
  generation += 1;
  pending = null;
  keepAnswer(false);
  publish("not-offered");
}

/** Test-only page-load boundary: forget module state but leave the tab's storage intact. */
export function resetSupportOfferedForTests(): void {
  generation += 1;
  pending = null;
  persisted = false;
  publish("unknown");
}
