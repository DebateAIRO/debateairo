/**
 * Engine shape constants — the fixed topology facts the cost envelope is derived
 * from. Held in their own module so the algorithm-policy row builder can read
 * them without importing the package barrel (which re-exports it).
 */
export const ENGINE_BRANCHING_FACTOR = 2 as const;
export const ENGINE_COMPOSITION_SEGMENT_CAP = 2 as const;
export const ENGINE_FIXED_ORGANS_PER_COMPOSITION = 1 + ENGINE_COMPOSITION_SEGMENT_CAP + 1;
export const ENGINE_MAX_RECOMPOSE = 2 as const;

/**
 * T16 / DECISIONS J1: the engine's EXISTING ordered band vocabulary. Seeded
 * verbatim — no name is invented here. The order is weakest-first: a candidate
 * band is CAPPED when its index exceeds the ceiling band's index
 * (packages/serve/src/index.ts deriveBandCeiling, `candidateIndex > ceilingIndex`).
 * Both deployment seeders build `wayOfKnowingCeiling.bandOrder` from this
 * constant, so the downgrade-bands row can never drift from the ceiling row.
 */
export const ENGINE_BAND_ORDER = Object.freeze(["CAPPED", "FULL"] as const);
