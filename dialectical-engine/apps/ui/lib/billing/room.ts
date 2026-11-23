"use client";

import { useCallback, useEffect, useState } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";

/**
 * The ask page's room read (budget spec §2.7, "the room read"; route B7a). It
 * returns a word, never a figure. It is ADVISORY: a failed read shows nothing,
 * and the ask itself stays authoritative, so every failure here is `null`.
 */
export type AskRoomQuery = Parameters<ContractClient["getAskRoom"]>[0];
export type AskRoom = Awaited<ReturnType<ContractClient["getAskRoom"]>>;

/**
 * Sentence D from a 422 ASK_ALREADY_WAITING itself (budget spec §2.7): its body
 * names the waiting run and its expected start, which the contract client keeps
 * as `ContractHttpError.waiting`. Used when the room re-read after that refusal
 * fails, so the person still reads D with its time. `null` for anything else.
 */
export function waitingRoomOf(error: unknown): AskRoom | null {
  if (!(error instanceof ContractHttpError) || error.waiting === null) return null;
  return Object.freeze({
    room: "ALREADY_WAITING" as const,
    scope: null,
    resets_at: error.waiting.waitsUntil,
    waiting_run_ref: error.waiting.runRef,
    plan_id: null
  });
}

export async function readAskRoom(
  client: Pick<ContractClient, "getAskRoom"> | undefined,
  query: AskRoomQuery
): Promise<AskRoom | null> {
  try {
    return await client!.getAskRoom(query);
  } catch {
    return null;
  }
}

/**
 * V4 start step, Task 70b (ask-f2): how the latest read went. LOADING until the first read answers; then READ or FAILED
 * from the latest read that answered (the page's own read or a `refresh`), kept while a new query is read.
 */
export type AskRoomRead = "LOADING" | "READ" | "FAILED";

/**
 * The room for `query`, re-read whenever the query changes; `refresh` re-reads on demand. The fourth item says how the
 * latest read went (a failed read is `null` like no read, so the room alone cannot say).
 * `enabled` false (a page that knows the visitor is signed out) reads nothing: the API could only refuse, and each refusal
 * makes the browser ask for the site password again. The room is then what a refused read leaves: `null`, FAILED.
 */
export function useAskRoom(
  client: Pick<ContractClient, "getAskRoom"> | undefined,
  query: AskRoomQuery,
  options: Readonly<{ enabled?: boolean }> = {}
): readonly [AskRoom | null, (room: AskRoom | null) => void, () => Promise<AskRoom | null>, AskRoomRead] {
  const enabled = options.enabled !== false;
  const [room, setRoom] = useState<AskRoom | null>(null);
  const [read, setRead] = useState<AskRoomRead>(enabled ? "LOADING" : "FAILED");
  const key = JSON.stringify(query);
  useEffect(() => {
    if (!enabled) {
      setRoom(null);
      setRead("FAILED");
      return;
    }
    let active = true;
    void readAskRoom(client, JSON.parse(key) as AskRoomQuery).then((value) => {
      if (!active) return;
      setRoom(value);
      setRead(value === null ? "FAILED" : "READ");
    });
    return () => { active = false; };
  }, [client, key, enabled]);
  const refresh = useCallback(async () => {
    if (!enabled) return null;
    const value = await readAskRoom(client, JSON.parse(key) as AskRoomQuery);
    setRoom(value);
    setRead(value === null ? "FAILED" : "READ");
    return value;
  }, [client, key, enabled]);
  return [room, setRoom, refresh, read] as const;
}
