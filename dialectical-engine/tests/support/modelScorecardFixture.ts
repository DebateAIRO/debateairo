import { readFile } from "node:fs/promises";
import { readEngineVersion } from "../../packages/register/src/index.js";

const EXAMPLE_SCORECARD = new URL("../../packages/scorecard/fixtures/example-scorecard.json", import.meta.url);
const PAD_BATCH = 100;

/**
 * A19 test support — the scorecard package's example, declared compatible with
 * THIS engine (`minEngineVersion` = the engine root manifest's version), at an
 * optional `scorecardVersion`. With `padToBytes`, its first role entry carries
 * extra evidence tags: the LARGEST such document whose `JSON.stringify` is at
 * most `padToBytes` (within one tag, about 75 bytes, of it), so a test can sit
 * just under the 64 KiB scorecard bound (owner ruling 2026-09-27). The tags
 * are ordinary schema members, so the document stays VALID. If the scorecard
 * schema bounds the tag count or text length, lower PAD_BATCH / the text and
 * keep the size target.
 */
export async function compatibleExampleScorecard(
  scorecardVersion?: number,
  padToBytes = 0
): Promise<Record<string, unknown>> {
  const example = JSON.parse(await readFile(EXAMPLE_SCORECARD, "utf8")) as Record<string, unknown>;
  const value: Record<string, unknown> = {
    ...example,
    ...(scorecardVersion === undefined ? {} : { scorecardVersion }),
    engineCompatibility: { minEngineVersion: await readEngineVersion(), maxEngineVersion: null }
  };
  if (padToBytes <= 0) return value;
  const roles = structuredClone(value.roles) as Record<string, Array<Record<string, unknown>>>;
  const role = Object.keys(roles).find((name) => (roles[name] ?? []).length > 0);
  if (role === undefined) throw new Error("the example scorecard has no role entry to pad");
  const [entry, ...rest] = roles[role]!;
  const documentWith = (tags: readonly Record<string, string>[]): Record<string, unknown> =>
    ({ ...value, roles: { ...roles, [role]: [{ ...entry, tags: [...tags] }, ...rest] } });
  const sizeWith = (tags: readonly Record<string, string>[]): number =>
    Buffer.byteLength(JSON.stringify(documentWith(tags)), "utf8");
  const tags = [...((entry!.tags as Array<Record<string, string>> | undefined) ?? [])];
  if (sizeWith(tags) > padToBytes) throw new Error("the example scorecard is already larger than padToBytes");
  const tagAt = (index: number) =>
    ({ code: `PAD_${index}`, strength: "WEAK", text: `padding evidence ${index} for a size check` });
  // Whole batches while they fit, then single tags: the result is the largest that fits.
  for (const step of [PAD_BATCH, 1]) {
    for (;;) {
      const next = [...tags];
      for (let added = 0; added < step; added += 1) next.push(tagAt(next.length));
      if (sizeWith(next) > padToBytes) break;
      tags.splice(0, tags.length, ...next);
    }
  }
  return documentWith(tags);
}
