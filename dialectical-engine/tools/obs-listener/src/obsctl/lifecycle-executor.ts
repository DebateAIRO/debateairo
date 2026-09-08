import type { SignerSlot } from "./signer-inventory.js";
import type { ManagedSignerSession } from "./signer-readiness.js";
import { releaseSignerSessions } from "./signer-readiness.js";

export interface LifecycleExecutorPort {
  verifyQuiescence(): Promise<void>;
  stagePublicAuthority(): Promise<void>;
  commitActivation(): Promise<void>;
  publishActivation(): Promise<void>;
  verifyParity(): Promise<void>;
}

export async function activateWithSignerSessions(
  port: LifecycleExecutorPort,
  sessions: Readonly<Record<SignerSlot, ManagedSignerSession>>,
  challenge: string,
  releaseRecord: (slot: SignerSlot, ordinal: string) => Readonly<Record<string, unknown>>,
): Promise<readonly unknown[]> {
  await port.verifyQuiescence();
  await port.stagePublicAuthority();
  await port.commitActivation();
  await port.publishActivation();
  await port.verifyParity();
  return releaseSignerSessions(sessions, challenge, releaseRecord);
}
