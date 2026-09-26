// ARCH-PES-S01 PROPOSED CODE — not product code. The body PLAN step S01-02 asks BUILD to add to
// packages/register/src/runtime-environment.ts after :238. Kept here only so `tsc` can check the plan's code block.

/**
 * An operator command run by hand names the keys it reads (ADR-0027); this file stays the ONE reader of the
 * process environment (tools/orphan-audit/src/index.ts:671-673). Exactly the listed keys that are set come back,
 * frozen: an unset key is absent, and a set key keeps its string value, empty included. A key a booting service
 * reads is read through that service's loader, never through this function.
 */
export function readOperatorCommandEnvironment<const K extends string>(
  keys: readonly K[]
): Readonly<Partial<Record<K, string>>> {
  const values: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) values[key] = value;
  }
  return Object.freeze(values);
}
