import type { SignerSlot } from "./signer-inventory.js";
import { SIGNER_SLOTS } from "./signer-inventory.js";
import { prepareChainedWriterSigner, type PinnedSignerSession } from "@debateai/obs-capture/chain";

export function prepareObsctlSignerSession(): Promise<PinnedSignerSession> {
  return prepareChainedWriterSigner("obsctl_action");
}

export interface ManagedSignerSession {
  readonly slot: SignerSlot;
  commitCheck(challenge: string): Promise<unknown>;
  release(record: Readonly<Record<string, unknown>>): Promise<unknown>;
  abort(): Promise<void>;
}

export async function releaseSignerSessions(
  sessions: Readonly<Record<SignerSlot, ManagedSignerSession>>,
  commitChallenge: string,
  releaseRecord: (slot: SignerSlot, ordinal: string) => Readonly<Record<string, unknown>>,
): Promise<readonly unknown[]> {
  if (!/^[0-9a-f]{64}$/u.test(commitChallenge)) throw new TypeError("FIX10_SIGNER_CHALLENGE");
  try {
    const checks: unknown[] = [];
    for (const slot of SIGNER_SLOTS) {
      if (sessions[slot].slot !== slot) throw new TypeError("FIX10_SIGNER_SESSION_SLOT");
      checks.push(await sessions[slot].commitCheck(commitChallenge));
    }
    const released: unknown[] = [];
    for (let index = 0; index < SIGNER_SLOTS.length; index += 1) {
      const slot = SIGNER_SLOTS[index]!;
      released.push(await sessions[slot].release(releaseRecord(slot, String(index + 1))));
    }
    return Object.freeze(released);
  } catch (error) {
    for (const slot of SIGNER_SLOTS) await sessions[slot].abort().catch(() => undefined);
    throw error;
  }
}
