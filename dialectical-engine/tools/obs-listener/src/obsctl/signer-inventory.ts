export const SIGNER_SLOTS = Object.freeze([
  "api_occurrence", "runner_occurrence", "scheduler_occurrence",
  "daemon_action", "obsctl_action", "watchdog_witness",
] as const);
export type SignerSlot = typeof SIGNER_SLOTS[number];

export interface SignerInventoryInput { readonly profile: SignerSlot; readonly ready: boolean }
export interface SignerInventoryRow extends SignerInventoryInput {
  readonly writerIdentity: string | null;
  readonly relativePath: string;
}

export interface ProductWriterIdentities {
  readonly api: string;
  readonly runner: string;
  readonly scheduler: string;
}

export function validateSignerInventory(
  input: readonly SignerInventoryInput[],
  identities: Readonly<ProductWriterIdentities>,
): readonly SignerInventoryRow[] {
  if (input.length !== SIGNER_SLOTS.length || input.some((row, index) => row.profile !== SIGNER_SLOTS[index] || row.ready !== true)) {
    throw new TypeError("FIX10_SIGNER_INVENTORY");
  }
  const identity = (name: keyof ProductWriterIdentities): string => {
    const value = identities[name];
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
      throw new TypeError("FIX10_SIGNER_IDENTITY");
    }
    return value;
  };
  const rows: SignerInventoryRow[] = input.map((row) => {
    if (row.profile === "api_occurrence") return Object.freeze({ ...row, writerIdentity: identity("api"), relativePath: `chain/private/${identity("api")}.pk8` });
    if (row.profile === "runner_occurrence") return Object.freeze({ ...row, writerIdentity: identity("runner"), relativePath: `chain/private/${identity("runner")}.pk8` });
    if (row.profile === "scheduler_occurrence") return Object.freeze({ ...row, writerIdentity: identity("scheduler"), relativePath: `chain/private/${identity("scheduler")}.pk8` });
    if (row.profile === "daemon_action") return Object.freeze({ ...row, writerIdentity: "fixagent-daemon", relativePath: "chain/private/fixagent-daemon.pk8" });
    if (row.profile === "obsctl_action") return Object.freeze({ ...row, writerIdentity: "obsctl", relativePath: "chain/private/obsctl.pk8" });
    return Object.freeze({ ...row, writerIdentity: null, relativePath: "keys/watchdog-witness.pk8" });
  });
  return Object.freeze(rows);
}
