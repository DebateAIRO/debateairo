import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Engine redesign R1d (absorbs LG-D Task 5): the runner's wiring, read off its source (CI skips the integration suites
 * that argue a whole run, so this is the gate that sees the story lose the engine or the table). Both come from the
 * RECEIPT (`engineOfRun(envelopeBasis)`, `envelopeBasis.length`), never from a register row: the rows decide admission
 * only, so a debate admitted before a row changed keeps the story it was admitted with.
 */
const source = readFileSync(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
const start = source.indexOf("input: buildStoryRunSnapshot({");
const end = source.indexOf('return { kind: "COMPLETED", answerId: persisted.answerId };');
const snapshot = source.slice(start, end);

describe("the runner hands the receipt's engine and length table to the story (R1d)", () => {
  it("reads the engine and the table from the receipt, before the story snapshot", () => {
    const engineRead = source.indexOf("const engine = engineOfRun(envelopeBasis);");
    const lengthRead = source.indexOf("const lengthGuidance = envelopeBasis.length ?? null;");
    expect(engineRead).toBeGreaterThan(-1);
    expect(lengthRead).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(engineRead);
    expect(start).toBeGreaterThan(lengthRead);
    expect(end).toBeGreaterThan(start);
  });

  it("passes the table beside the language lock, the engine only for engine 2, and the backups in panel order", () => {
    // R22 (owner N6, 2026-10-29): the V4 reading level rides between the language lock and the table.
    expect(snapshot).toMatch(
      /languageLocked: shapeLanguage !== null,\s*\n(?:\s*\/\/[^\n]*\n)*\s*readingLevel,\s*\n(?:\s*\/\/[^\n]*\n)*\s*\.\.\.\(lengthGuidance === null \? \{\} : \{ lengthGuidance \}\),/u);
    expect(snapshot).toContain("engine: engine.engine === 2 ? engine : null,");
    // Pre-flight PF-D7.3 (ruling "backup vs sit-out book"): the members the sit-out book has benched are not offered.
    // Whole-branch review Minor 1 (ruling W1): the maker rule reads every claim-eligible member's maker BEFORE the
    // sit-out filter (unfiltered `synthesisMakers`, out-of-panel register refs included), so a benched or out-of-panel
    // role still excludes its maker.
    expect(snapshot).toMatch(
      /\.\.\.\(engine\.engine === 2\s*\?\s*\{\s*backupCandidates: storyBackupCandidatesFrom\(\{\s*panelRefs: run\.discoveredPanel\.map\(\(member\) => member\.provider_ref\),\s*claimEligible: synthesisMakers\.filter\(\(member\) => sitOut\?\.sitsOut\(member\.providerRef\) !== true\)\s*\}\),\s*backupMakers: storyBackupMakersFrom\(synthesisMakers\)\s*\}\s*:\s*\{\}\),/u);
  });

  it("never offers a backup storyteller the preview's sit-out book has benched (ruling: backup vs sit-out book)", () => {
    // Pre-flight PF-D7.3. G7 + the sit-out rule: a member that sits out the rest of the run is refused before sending,
    // and the story's cost fallback would then move the backup to any claim-eligible maker (even the first
    // storyteller's or the checker's). The book is the run's own `sitOut` (null off the preview: nothing is filtered),
    // read before the snapshot in the same method.
    const bookRead = source.indexOf("const sitOut: RunSitOutBook | null = ");
    expect(bookRead).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(bookRead);
    expect(snapshot).not.toMatch(/claimEligible: synthesisMakers\s*\}/u);
  });

  it("never reads a register row for the story", () => {
    expect(snapshot).not.toMatch(/readEngineVersionPolicy|readLengthGuidancePolicy|engineVersionPolicy|lengthGuidancePolicy|engineInForce/u);
  });
});
