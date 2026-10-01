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

/** The room for `query`, re-read whenever the query changes; `refresh` re-reads on demand. */
export function useAskRoom(
  client: Pick<ContractClient, "getAskRoom"> | undefined,
  query: AskRoomQuery
): readonly [AskRoom | null, (room: AskRoom | null) => void, () => Promise<AskRoom | null>] {
  const [room, setRoom] = useState<AskRoom | null>(null);
  const key = JSON.stringify(query);
  useEffect(() => {
    let active = true;
    void readAskRoom(client, JSON.parse(key) as AskRoomQuery).then((value) => {
      if (active) setRoom(value);
    });
    return () => { active = false; };
  }, [client, key]);
  const refresh = useCallback(async () => {
    const value = await readAskRoom(client, JSON.parse(key) as AskRoomQuery);
    setRoom(value);
    return value;
  }, [client, key]);
  return [room, setRoom, refresh] as const;
}
