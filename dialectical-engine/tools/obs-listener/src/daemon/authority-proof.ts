import type { KeyObject } from "node:crypto";
import { canonicalJson } from "../obsctl/action-wire.js";
import { createAuthorityProof } from "../obsctl/authority-proof.js";

export interface DaemonProofPort {
  sample(): Promise<Readonly<Record<string, unknown>>>;
  validateAllConjuncts(sample: Readonly<Record<string, unknown>>): Promise<void>;
  replace(bytes: Uint8Array): Promise<void>;
}

export async function publishAuthorityProof(port: DaemonProofPort, key: KeyObject): Promise<Readonly<Record<string, unknown>>> {
  const sample = await port.sample();
  await port.validateAllConjuncts(sample);
  const completed = createAuthorityProof(sample, key);
  await port.replace(Buffer.from(`${canonicalJson(completed)}\n`, "utf8"));
  return completed;
}
