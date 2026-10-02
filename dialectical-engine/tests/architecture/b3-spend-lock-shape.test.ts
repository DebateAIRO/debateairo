import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Budget spec §2.6 — the two locks every room decision takes, as TEXT (the
 * engine is down in this suite). The same single-key bigint form over
 * `hashtextextended(<text>, 0)` that tests/architecture/v28-advisory-lock-shape.test.ts
 * requires of the day lock in model-spend.ts, and the same day key, so an old
 * settings version's admission and a new one's can never decide the same day
 * at once. Day first, then person: two decisions can never deadlock.
 */
const LOCK = new URL("../../packages/budget/src/spend-lock.ts", import.meta.url);

describe("B3 the room decision's locks use a function PostgreSQL has", () => {
  it("takes the day lock, then the person lock, each a single bigint key", async () => {
    const source = await readFile(LOCK, "utf8");
    const day = source.indexOf("hashtextextended('debateai.cost_envelope.day:' || $1, 0)");
    const person = source.indexOf("hashtextextended('debateai.cost_envelope.person:' || $1, 0)");
    expect(day).toBeGreaterThan(-1);
    expect(person).toBeGreaterThan(day);
    expect(source.match(/pg_advisory_xact_lock\(/gu)).toHaveLength(2);
    expect(source).not.toMatch(/\bhashtext\(/u);
    expect(source).not.toMatch(/pg_advisory_xact_lock\([^()]*,[^()]*\)\s*"/u);
  });
});
