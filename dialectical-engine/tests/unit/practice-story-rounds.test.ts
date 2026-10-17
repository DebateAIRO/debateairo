import { describe, expect, it } from "vitest";
import { PREVIEW_PROVIDER_REF_MODELS, buildFramedRevisionPrompt } from "@debateai/providers";
import { practiceIsRevisionPrompt, practiceReplyFormOf } from "../../tools/preview-practice/practice-lanes.js";
import {
  practiceCheckerVerdictOf,
  practicePatchBaseOf,
  practicePatchedCheckerVerdictOf,
  practiceStoryBackupRows,
  practiceStoryEngineLines,
  practiceStoryReadyRate,
  practiceStoryRoundFactsOf,
  practiceStoryRoundRows
} from "../../tools/preview-practice/practice-story-rounds.js";
import { framedFixturePacket } from "../support/framed-packet.js";

/**
 * Engine row, the story in the practice report (spec 2026-10-15 engine redesign §7.2 items 7, 8, 11, §14; INTERFACE
 * §15.4): one row per story round, one per backup storyteller, the stored stories by outcome. Counts and codes only.
 */

const CRITERIA = { faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
  citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true };

describe("practice: the story checker's verdict, read for the report (R1d)", () => {
  it("v4: satisfied and misleading; v3: misleading unknown; anything else: no verdict", () => {
    expect(practiceCheckerVerdictOf(JSON.stringify({ satisfied: false, misleading: true, objection: "x", criteria: CRITERIA })))
      .toEqual({ satisfied: false, misleading: true });
    expect(practiceCheckerVerdictOf(JSON.stringify({ satisfied: false, misleading: false, objection: "x", criteria: CRITERIA })))
      .toEqual({ satisfied: false, misleading: false });
    expect(practiceCheckerVerdictOf(JSON.stringify({ satisfied: true, objection: null, criteria: CRITERIA })))
      .toEqual({ satisfied: true, misleading: null });
    expect(practiceCheckerVerdictOf(JSON.stringify({ satisfied: true, misleading: "no" }))).toEqual({ satisfied: true, misleading: null });
    expect(practiceCheckerVerdictOf(JSON.stringify({ objection: null }))).toBeNull();
    expect(practiceCheckerVerdictOf("not json")).toBeNull();
  });
});

describe("practice: one row per story round (R1d)", () => {
  it("names each round's outcome by the checker's verdict, in round order", () => {
    expect(practiceStoryRoundRows([
      { round: 2, model: "m", drafted: true, revisedOwnDraft: true, verdict: { satisfied: true, misleading: false } },
      { round: 1, model: "m", drafted: true, revisedOwnDraft: false, verdict: { satisfied: false, misleading: true } },
      { round: 3, model: "b", drafted: true, revisedOwnDraft: false, verdict: { satisfied: false, misleading: false } },
      { round: 4, model: "b", drafted: true, revisedOwnDraft: false, verdict: { satisfied: false, misleading: null } },
      { round: 5, model: "c", drafted: false, revisedOwnDraft: false, verdict: { satisfied: true, misleading: false } },
      { round: 6, model: "c", drafted: true, revisedOwnDraft: false, verdict: null }
    ])).toEqual([
      { model: "m", round: 1, misleading: true, wordingNoteOnly: false, revisedOwnDraft: false, outcome: "MISLEADING" },
      { model: "m", round: 2, misleading: false, wordingNoteOnly: false, revisedOwnDraft: true, outcome: "SATISFIED" },
      { model: "b", round: 3, misleading: false, wordingNoteOnly: true, revisedOwnDraft: false, outcome: "WORDING_NOTE_ONLY" },
      { model: "b", round: 4, misleading: null, wordingNoteOnly: false, revisedOwnDraft: false, outcome: "NOT_SATISFIED" },
      { model: "c", round: 5, misleading: null, wordingNoteOnly: false, revisedOwnDraft: false, outcome: "NO_DRAFT" },
      { model: "c", round: 6, misleading: null, wordingNoteOnly: false, revisedOwnDraft: false, outcome: "NO_VERDICT" }
    ]);
  });

  // Pre-flight PF-D8.2: a reply Haiku's structure repair rescued stands under REPAIR:STRUCTURE:<key>, while the round's
  // own try stays FAILED (packages/ledger/src/index.ts structureRepairAnsweredSql). It still counts for its round.
  it("a draft and a checker verdict rescued by the structure repair count for their round; Haiku never names the round", () => {
    const facts = practiceStoryRoundFactsOf([
      { callSiteKey: "STORY:STORYTELLER:1", model: "m", accepted: false, revisionPrompt: false, verdict: null },
      { callSiteKey: "REPAIR:STRUCTURE:STORY:STORYTELLER:1", model: "h", accepted: true, revisionPrompt: null, verdict: null },
      { callSiteKey: "STORY:CHECKER:1", model: "c", accepted: false, revisionPrompt: null, verdict: null },
      { callSiteKey: "REPAIR:STRUCTURE:STORY:CHECKER:1", model: "h", accepted: true, revisionPrompt: null,
        verdict: { satisfied: false, misleading: true } },
      { callSiteKey: "REPAIR:STRUCTURE:STORY:STORYTELLER:2", model: "h", accepted: true, revisionPrompt: null, verdict: null },
      { callSiteKey: "ANSWER:WRITER", model: "w", accepted: true, revisionPrompt: null, verdict: null }
    ]);
    expect(practiceStoryRoundRows(facts)).toEqual([
      { model: "m", round: 1, misleading: true, wordingNoteOnly: false, revisedOwnDraft: false, outcome: "MISLEADING" }
    ]);
  });
});

// Fix round 1: a checker verdict accepted through the PATCH follow-up is stored as the patch alone (dotted keys); the
// merged verdict is never stored, so it is rebuilt from the call's earlier refused try, as the gateway merged it.
describe("practice: a story checker verdict accepted through the patch follow-up (R1d, fix round 1)", () => {
  const earlier = JSON.stringify({ satisfied: false, misleading: true, objection: "x",
    criteria: { ...CRITERIA, no_overstatement: "not a boolean" } });

  it("the patch is applied at its dotted paths onto the earlier refused try, then the verdict is read", () => {
    expect(practicePatchedCheckerVerdictOf(earlier, JSON.stringify({ "criteria.no_overstatement": false })))
      .toEqual({ satisfied: false, misleading: true });
    expect(practicePatchedCheckerVerdictOf(JSON.stringify({ satisfied: "yes", misleading: true, objection: null, criteria: CRITERIA }),
      JSON.stringify({ satisfied: true, misleading: false }))).toEqual({ satisfied: true, misleading: false });
  });

  it("an earlier try that cannot be read, or a patch that does not merge into it, is VERDICT_UNREAD, never NO_VERDICT", () => {
    const patch = JSON.stringify({ "criteria.no_overstatement": false });
    expect(practicePatchedCheckerVerdictOf(null, patch)).toBe("UNREAD");
    expect(practicePatchedCheckerVerdictOf("not json", patch)).toBe("UNREAD");
    expect(practicePatchedCheckerVerdictOf(earlier, "not json")).toBe("UNREAD");
    expect(practicePatchedCheckerVerdictOf(earlier, JSON.stringify({ "nowhere.at.all": true }))).toBe("UNREAD");
    const facts = practiceStoryRoundFactsOf([
      { callSiteKey: "STORY:STORYTELLER:1", model: "m", accepted: true, revisionPrompt: false, verdict: null },
      { callSiteKey: "STORY:CHECKER:1", model: "c", accepted: false, revisionPrompt: null, verdict: null },
      { callSiteKey: "STORY:CHECKER:1", model: "c", accepted: true, revisionPrompt: null, verdict: "UNREAD" }
    ]);
    expect(practiceStoryRoundRows(facts)).toEqual([
      { model: "m", round: 1, misleading: null, wordingNoteOnly: false, revisedOwnDraft: false, outcome: "VERDICT_UNREAD" }
    ]);
  });

  // Task 22 re-review (b), final wave A3 (defense in depth): a patch key the gateway's own path rule (isPatchPath) refuses
  // never reaches mergePatchReply in the practice process, so no stored reply can set a prototype here.
  it("a patch key the gateway would never accept (__proto__, constructor, prototype, a bad segment) is UNREAD; nothing is merged", () => {
    const probe = "r1dFinalWaveProbe";
    try {
      expect(practicePatchedCheckerVerdictOf(earlier, `{"constructor.prototype.${probe}": true}`)).toBe("UNREAD");
      expect(practicePatchedCheckerVerdictOf(earlier, `{"__proto__.${probe}": true}`)).toBe("UNREAD");
      expect(Object.hasOwn(Object.prototype, probe)).toBe(false);
      expect(practicePatchedCheckerVerdictOf(earlier, JSON.stringify({ "criteria.prototype": true }))).toBe("UNREAD");
      expect(practicePatchedCheckerVerdictOf(earlier, JSON.stringify({ "criteria..no_overstatement": false }))).toBe("UNREAD");
      // One bad key spoils the whole patch, as the gateway refuses it whole.
      expect(practicePatchedCheckerVerdictOf(earlier, JSON.stringify({ "criteria.no_overstatement": false, "criteria.constructor": 1 })))
        .toBe("UNREAD");
    } finally {
      delete (Object.prototype as Record<string, unknown>)[probe];
    }
  });

  // Task 22 re-review (a), final wave A2: when Haiku's structure repair ran between the earlier try and the patch, the
  // salvage's follow-up B was built on the repair's shaped tree, not on the earlier raw reply: the base is unknown.
  it("the patch's base: the same call's latest earlier refused try, none when a structure repair of that key sits between", () => {
    const row = (callSiteKey: string, actorRef: string, replyForm: string | null, parseStatus: string | null) => Object.freeze({
      call_site_key: callSiteKey, actor_ref: actorRef, reply_form: replyForm, raw_artifact_ref: `artifact:${String(callSiteKey.length)}`,
      parse_status: parseStatus });
    const refused = row("STORY:CHECKER:1", "c", null, "SCHEMA_FAILED");
    const patch = row("STORY:CHECKER:1", "c", "PATCH", "PARSED");
    const repair = row("REPAIR:STRUCTURE:STORY:CHECKER:1", "haiku", "STRUCTURE", "SCHEMA_FAILED");
    expect(practicePatchBaseOf([refused, patch], 1)).toBe(refused);
    expect(practicePatchBaseOf([refused, repair, patch], 2)).toBeNull();
    // A repair of another call, or one before the earlier try, changes nothing.
    expect(practicePatchBaseOf([refused, row("REPAIR:STRUCTURE:STORY:CHECKER:2", "haiku", "STRUCTURE", "SCHEMA_FAILED"), patch], 2))
      .toBe(refused);
    expect(practicePatchBaseOf([repair, refused, patch], 2)).toBe(refused);
    // Another AI's try of the same key, an accepted try, a patch try: never the base.
    expect(practicePatchBaseOf([row("STORY:CHECKER:1", "other", null, "SCHEMA_FAILED"), patch], 1)).toBeNull();
    expect(practicePatchBaseOf([row("STORY:CHECKER:1", "c", null, "PARSED"), patch], 1)).toBeNull();
    expect(practicePatchBaseOf([row("STORY:CHECKER:1", "c", "PATCH", "SCHEMA_FAILED"), patch], 1)).toBeNull();
  });

  it("a merged verdict counts for its round like any accepted verdict", () => {
    const verdict = practicePatchedCheckerVerdictOf(earlier, JSON.stringify({ "criteria.no_overstatement": false }));
    const facts = practiceStoryRoundFactsOf([
      { callSiteKey: "STORY:STORYTELLER:1", model: "m", accepted: true, revisionPrompt: false, verdict: null },
      { callSiteKey: "STORY:CHECKER:1", model: "c", accepted: false, revisionPrompt: null, verdict: null },
      { callSiteKey: "STORY:CHECKER:1", model: "c", accepted: true, revisionPrompt: null, verdict }
    ]);
    expect(practiceStoryRoundRows(facts)).toEqual([
      { model: "m", round: 1, misleading: true, wordingNoteOnly: false, revisedOwnDraft: false, outcome: "MISLEADING" }
    ]);
  });
});

describe("practice: a round that revises its own draft (R1d)", () => {
  const packet = framedFixturePacket("Should the city fund the tram now?");
  const draft = JSON.stringify({ short: { headline: "Yes, fund it now." } });
  const problems = "The headline overstates what the debate found.";

  it("the revision packet carries the model's own draft as its own turn and the REVISION form; nothing else counts", () => {
    expect(practiceIsRevisionPrompt(buildFramedRevisionPrompt(packet, draft, problems).messages)).toBe(true);
    expect(practiceIsRevisionPrompt(packet.messages)).toBe(false);
    const handMade = [...packet.messages, { role: "assistant" as const, content: draft }, { role: "user" as const, content: "not a block" }];
    expect(practiceIsRevisionPrompt(handMade)).toBe(false);
  });

  it("the slip rule reads a revision's first try as the round's own packet and its repair as the full re-ask, never as a patch", () => {
    expect(practiceReplyFormOf(buildFramedRevisionPrompt(packet, draft, problems).messages)).toBe("ORIGINAL");
    expect(practiceReplyFormOf(buildFramedRevisionPrompt(packet, draft, problems, { code: "SCHEMA_FAILED", path: "short.headline" }).messages))
      .toBe("FULL");
  });
});

describe("practice: backups, outcomes and the report lines (R1d)", () => {
  const ref = Object.keys(PREVIEW_PROVIDER_REF_MODELS)[0]!;

  it("a backup row names the first storyteller's model, the signal, the backup's model and the story's outcome", () => {
    expect(practiceStoryBackupRows({ backup: null, backupModel: null, outcome: "READY" })).toEqual([]);
    expect(practiceStoryBackupRows({ backup: { code: "STORY_BACKUP_USED", signal: "TOO_SLOW", firstModel: ref }, backupModel: "b", outcome: "READY" }))
      .toEqual([{ firstModel: PREVIEW_PROVIDER_REF_MODELS[ref], signal: "TOO_SLOW", backupModel: "b", outcome: "READY" }]);
    expect(practiceStoryBackupRows({ backup: { code: "STORY_BACKUP_USED", signal: "UNREACHABLE", firstModel: "x:unknown" }, backupModel: null, outcome: null }))
      .toEqual([{ firstModel: "unreviewed:x:unknown", signal: "UNREACHABLE", backupModel: null, outcome: "MISSING" }]);
  });

  it("counts the stored stories by outcome", () => {
    expect(practiceStoryReadyRate(["READY", "READY_WITH_RESERVATION", "FAILED", "READY"])).toEqual({ ready: 2, readyWithReservation: 1, failed: 1 });
    expect(practiceStoryReadyRate([])).toEqual({ ready: 0, readyWithReservation: 0, failed: 0 });
  });

  it("report lines: the engine, then counts and codes only", () => {
    const lines = practiceStoryEngineLines({ engine: 2,
      storyRounds: [{ model: "m", round: 1, misleading: true, wordingNoteOnly: false, revisedOwnDraft: false, outcome: "MISLEADING" }],
      storyBackups: [{ firstModel: "a", signal: "OUT_OF_ROOM", backupModel: "b", outcome: "READY" }],
      storyReadyRate: { ready: 1, readyWithReservation: 0, failed: 0 } }).join("\n");
    expect(lines).toContain("Engine: 2 (the engine row; the story is told with story v4).");
    expect(lines).toContain("| m | 1 | MISLEADING | yes | no | no |");
    expect(lines).toContain("- a (OUT_OF_ROOM) -> b: READY");
    expect(lines).toContain("Story outcomes: READY 1, READY_WITH_RESERVATION 0, FAILED 0.");
    const today = practiceStoryEngineLines({ engine: 1, storyRounds: [], storyBackups: [],
      storyReadyRate: { ready: 0, readyWithReservation: 0, failed: 0 } }).join("\n");
    expect(today).toContain("Engine: 1 (today's engine; story v3).");
    expect(today).not.toContain("Story rounds");
    expect(today).not.toContain("Story backups");
  });
});
