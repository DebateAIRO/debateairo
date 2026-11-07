import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BACKUP_MODEL_USED_WORDING, backupModelUsedRecords, type BackupAnswer } from "@debateai/runner";
import { createReplayBook, recordedCalls, type RecordedAttempt } from "../../apps/runner/src/run-replay.js";
import { shapeSpareForRefusedRoot, shapeSpareThatAnswered } from "../../apps/runner/src/shape-seats.js";

/**
 * R22 (owner ruling 2026-10-30, "Yes, use the spare debater") — A POSITION WHOSE ANSWER IS REFUSED AFTER EVERY REPAIR,
 * ON A SEAT WITH NO USABLE BACKUP, IS WRITTEN BY A SPARE DEBATER.
 *
 * 379ad0c99 hands such a position to the seat's backup. The test site's seats have none (its legacy book has no
 * runner-ups), so there the R21 MiMo shape — the content schema refused on the original answer and on the patch
 * follow-up — still failed the whole debate. The debate shape already hands a position whose AI sits out to a seat no
 * position uses (`shapeHandOverRoot`'s SWAP); a refused position now takes the same hand-over: a spare of another maker,
 * up, not sitting out. These are the pure parts and the runner's wiring; the debate itself is argued end to end in
 * tests/integration/r22-spare-debater-run.test.ts.
 */

describe("R22 · which spare a refused position goes to", () => {
  const makers = ["Xiaomi", "DeepSeek", "Qwen", "Anthropic"];
  const free = () => false;
  const every = () => true;

  it("the free plan's spare: the seat no position uses, of another maker (root 0 and a later root alike)", () => {
    expect(shapeSpareForRefusedRoot({ makers, rootCount: 3, rootIndex: 0, sitsOut: free, refusedMakers: ["Xiaomi"], takes: every })).toBe(3);
    expect(shapeSpareForRefusedRoot({ makers, rootCount: 3, rootIndex: 1, sitsOut: free, refusedMakers: ["DeepSeek"], takes: every })).toBe(3);
  });

  it("never a spare of the refused maker, and never one that cannot take it (down, sitting out, refused before, arguing another position)", () => {
    expect(shapeSpareForRefusedRoot({ makers: ["Xiaomi", "DeepSeek", "Xiaomi", "Qwen"], rootCount: 2, rootIndex: 0, sitsOut: free,
      refusedMakers: ["Xiaomi"], takes: every })).toBe(3);
    expect(shapeSpareForRefusedRoot({ makers, rootCount: 2, rootIndex: 0, sitsOut: free, refusedMakers: ["Xiaomi"],
      takes: (index) => index !== 2 })).toBe(3);
    expect(shapeSpareForRefusedRoot({ makers, rootCount: 3, rootIndex: 0, sitsOut: free, refusedMakers: ["Xiaomi"],
      takes: () => false })).toBeNull();
  });

  it("never a spare whose maker already argues another position", () => {
    expect(shapeSpareForRefusedRoot({ makers: ["Xiaomi", "DeepSeek", "DeepSeek", "Qwen"], rootCount: 2, rootIndex: 0, sitsOut: free,
      refusedMakers: ["Xiaomi"], takes: every })).toBe(3);
  });

  it("no spare at all — the shape argues every seat (Pro with four answers), or today's opening — and never a SHARE: today's rule", () => {
    expect(shapeSpareForRefusedRoot({ makers, rootCount: 4, rootIndex: 1, sitsOut: free, refusedMakers: ["DeepSeek"], takes: every })).toBeNull();
    // The sit-out hand-over would SHARE here; a refused position is never put on a seat that argues one already.
    expect(shapeSpareForRefusedRoot({ makers: ["Xiaomi", "DeepSeek"], rootCount: 2, rootIndex: 0, sitsOut: free, refusedMakers: ["Xiaomi"],
      takes: every })).toBeNull();
  });

  it("a later root's hand-over reads who really sits out among the positions, as the sit-out hand-over does", () => {
    // Root 2's Qwen sits out, so Qwen's spare seat may take root 0 (a maker no working position argues).
    expect(shapeSpareForRefusedRoot({ makers: ["Xiaomi", "DeepSeek", "Qwen", "Qwen"], rootCount: 3, rootIndex: 0,
      sitsOut: (index) => index === 2, refusedMakers: ["Xiaomi"], takes: every })).toBe(3);
    expect(shapeSpareForRefusedRoot({ makers: ["Xiaomi", "DeepSeek", "Qwen", "Qwen"], rootCount: 3, rootIndex: 0,
      sitsOut: free, refusedMakers: ["Xiaomi"], takes: every })).toBeNull();
  });
});

describe("R22 · a resumed run keeps the spare an earlier pass handed the position to", () => {
  const seatRefs = [["preview:mimo"], ["preview:deepseek"], ["preview:qwen"], ["preview:haiku"]];

  it("the spare whose member answered the root's site, when no member of the root's own seat did", () => {
    expect(shapeSpareThatAnswered({ seatRefs, rootCount: 3, rootIndex: 0, answeredBy: ["preview:haiku"], sitsOut: () => false })).toBe(3);
  });

  it("nothing when the root's own seat answered it, when nobody did, or when the spare now sits out", () => {
    expect(shapeSpareThatAnswered({ seatRefs, rootCount: 3, rootIndex: 0, answeredBy: ["preview:mimo"], sitsOut: () => false })).toBeNull();
    expect(shapeSpareThatAnswered({ seatRefs, rootCount: 3, rootIndex: 0, answeredBy: [], sitsOut: () => false })).toBeNull();
    expect(shapeSpareThatAnswered({ seatRefs, rootCount: 3, rootIndex: 0, answeredBy: ["preview:haiku"], sitsOut: (index) => index === 3 }))
      .toBeNull();
    // A position's member is never a spare: only seats no position uses are read.
    expect(shapeSpareThatAnswered({ seatRefs, rootCount: 3, rootIndex: 0, answeredBy: ["preview:qwen"], sitsOut: () => false })).toBeNull();
  });

  it("the replay book names the routes whose recorded answer at a site is still to be replayed", () => {
    const attempt = (callSiteKey: string, actorRef: string, outcome: string): RecordedAttempt => ({
      callSiteKey, actorRef, outcome, ledgerEntryRef: `ledger:${actorRef}:${outcome}`, rawArtifactRef: null, thinkingLevel: null,
      promptFingerprint: null, artifact: null
    });
    const book = createReplayBook({ calls: recordedCalls([
      attempt("JUDGE", "preview:mimo", "FAILED"), attempt("JUDGE", "preview:mimo", "FAILED"),
      attempt("JUDGE", "preview:haiku", "OK"), attempt("JUDGE:root:secondary", "preview:deepseek", "OK")
    ]), earlierNodes: [] });
    expect(book.answeredBy((key) => key === "JUDGE")).toEqual(["preview:haiku"]);
    expect(book.answeredBy((key) => key === "JUDGE:root:secondary")).toEqual(["preview:deepseek"]);
    expect(book.answeredBy((key) => key === "JUDGE:root:2")).toEqual([]);
    book.close();
    expect(book.answeredBy((key) => key === "JUDGE")).toEqual([]);
  });
});

describe("R22 · the answer discloses a spare's position the way every stand-in is disclosed", () => {
  it("one plain BACKUP-MODEL-USED stand-in record, however many positions a spare wrote, and with a backup's too", () => {
    const records = backupModelUsedRecords({ answers: [], fallbackRoles: [], spareAnswers: 2 }, "node:served");
    expect(records).toEqual([expect.objectContaining({
      mark: "BACKUP-MODEL-USED", scope: "answer", subjectRef: BACKUP_MODEL_USED_WORDING.STAND_IN.subject,
      reason: BACKUP_MODEL_USED_WORDING.STAND_IN.reason, affectedNodeIds: ["node:served"], callSiteKey: null, terminalTransportOutcome: null
    })]);
    const backup: BackupAnswer = { role: "POSITION", seatIndex: 0, callSiteKey: "JUDGE:seat:runnerUp", plannedSlot: "MAIN",
      answeredSlot: "RUNNER_UP", providerRef: "provider:b" };
    expect(backupModelUsedRecords({ answers: [backup], fallbackRoles: [], spareAnswers: 1 }, "node:served")).toHaveLength(1);
  });

  it("no spare's position: today's records, unchanged", () => {
    expect(backupModelUsedRecords({ answers: [], fallbackRoles: [], spareAnswers: 0 }, "node:served")).toEqual([]);
    expect(backupModelUsedRecords({ answers: [], fallbackRoles: [] }, "node:served")).toEqual([]);
  });
});

describe("R22 · the runner hands a refused position to a spare", () => {
  const source = readFileSync(fileURLToPath(new URL("../../apps/runner/src/index.ts", import.meta.url)), "utf8");
  const between = (start: string, end: string): string => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    return source.slice(from, to);
  };

  it("only a shaped run's position, and only on the gateway's refusal after its repairs", () => {
    const handOver = between("const handRefusedRootToSpare = async (", "const resumeSpareHandOver = ");
    expect(handOver).toContain("if (shapePlan === null || !(error instanceof JudgeContentRefusedError)) return false;");
    expect(handOver).toContain("shapeSpareForRefusedRoot({");
    // Up, not sitting out, never refused a position, arguing no other one.
    expect(handOver).toContain("!refusedRootSeats.has(seat) && !seatSitsOut(seat) && seatCaller.plan(seat, siteKey) !== null");
    expect(handOver).toContain("&& !otherRootMakers.includes(seat.main.maker)");
    // The same SWAP as the sit-out hand-over, then the switch is told on the progress stream.
    expect(handOver).toContain("[rootSeats[rootIndex], rootSeats[spare]] = [to, refused];");
    expect(handOver).toContain("cause: \"CONTENT_REFUSED\"");
  });

  it("root 0 and every later root ask the spare at once, for the same leg at the same site", () => {
    expect(source).toContain("let primaryAttempt = await openFirstPosition(rootSeats[0]!, rootLegOf(0)).catch(openRootZeroBySpare);");
    expect(source).toContain("primaryAttempt = await openFirstPosition(rootSeats[0]!, rootLegOf(0)).catch(openRootZeroBySpare);");
    const rootZero = between("const openRootZeroBySpare = async (", "resumeSpareHandOver(0);");
    expect(rootZero).toContain("if (!(await handRefusedRootToSpare(0, refused))) throw refused;");
    // A spend refusal of the spare's own call spent nothing on it: the debate ends on the refusal, as today.
    expect(rootZero).toContain("if (next instanceof TypedDomainError && next.code === \"RUN_CEILING_BELOW_FIRST_CALL\") throw refusal;");
    const root = between("const rootChain = async (", "if (authoredRoot.kind === \"HALTED\") {");
    expect(root).toContain("if (!(await handRefusedRootToSpare(rootIndex, refused))) throw refused;");
    expect(root).toContain("authoredRoot = await authorAndPanel({ ...input, seat: rootSeats[rootIndex]!,");
    // Its leg's receipt was written for the refused call: the spare's call writes none of its own.
    expect(root).toContain("receiptWritten: true }, told);");
    expect(source).toContain("const scheduled: Promise<unknown> = input.receiptWritten === true ? Promise.resolve() : this.#ledger.append({");
  });

  it("a resumed pass hands the position over again before any call, and the answer discloses every spare's position", () => {
    expect(source).toContain("answeredBy: replayBook.answeredBy((key) => seatBaseCallSiteKey(key) === siteKey)");
    const root = between("const rootChain = async (", "if (dropSatOutRoot(rootIndex, true)) return;");
    expect(root).toContain("resumeSpareHandOver(rootIndex);");
    expect(between("resumeSpareHandOver(0);", "const judged = primaryAttempt.value.value;")).toContain("if (spareRoots.has(0)) spareAnswers += 1;");
    expect(source).toContain("if (spareRoots.has(rootIndex)) spareAnswers += 1;");
    expect(between("const backupRecords = backupModelUsedRecords({", "}, servedRoot.nodeId);")).toContain("spareAnswers");
  });
});
