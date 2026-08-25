"use client";

import { useSyncExternalStore } from "react";

let recoveryAcknowledgementPending = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readRecoveryAcknowledgementPending(): boolean {
  return recoveryAcknowledgementPending;
}

export function setRecoveryAcknowledgementPending(pending: boolean): void {
  if (pending === recoveryAcknowledgementPending) return;
  recoveryAcknowledgementPending = pending;
  for (const listener of listeners) listener();
}

export function useRecoveryAcknowledgementPending(): boolean {
  return useSyncExternalStore(
    subscribe,
    readRecoveryAcknowledgementPending,
    () => false
  );
}
