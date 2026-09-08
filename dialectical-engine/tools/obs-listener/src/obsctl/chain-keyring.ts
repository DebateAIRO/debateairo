export interface KeyringState { readonly generation: string; readonly digest: string }
export interface NextKeyring { readonly generation: string; readonly prior: string | null }

export function validateKeyringTransition(prior: KeyringState | undefined, next: NextKeyring): true {
  if (!/^[1-9][0-9]*$/u.test(next.generation)) throw new TypeError("FIX10_KEYRING_GENERATION");
  const expected = prior === undefined ? 1n : BigInt(prior.generation) + 1n;
  if (BigInt(next.generation) !== expected) throw new TypeError("FIX10_KEYRING_GENERATION");
  if (next.prior !== (prior?.digest ?? null)) throw new TypeError("FIX10_KEYRING_PRIOR");
  return true;
}
