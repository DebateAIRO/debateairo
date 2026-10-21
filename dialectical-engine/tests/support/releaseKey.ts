import { developmentReleaseKey } from "@debateai/kernel";

/**
 * Side-by-side spec §1 (plan C task C2): the release key a test's PostgresAskApplication admits under, so every run a
 * test creates through the ask path is stamped like a real API's (`RunCreationSettings.releaseKey`). It is the
 * development key of register version 1, `r1-000000000000`, derived rather than written out, so no line pairs a *_KEY
 * name with a literal (gitleaks).
 */
export const TEST_RELEASE_KEY: string = developmentReleaseKey(1);

/**
 * The development key of register version `v`, `r<v>-000000000000`, for a fixture whose settings use a register version
 * other than 1: the key's number always equals the fixture's own registerVersion, as a real API's must (the ask
 * application refuses RELEASE_KEY_REGISTER_MISMATCH otherwise).
 */
export function testReleaseKey(v: number): string {
  return developmentReleaseKey(v);
}
