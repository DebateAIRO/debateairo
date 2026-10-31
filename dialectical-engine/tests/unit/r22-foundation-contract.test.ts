import { describe, expect, it } from "vitest";
import {
  AnswerContributionSchema, AnswerMainAnswerSchema, AskRequestSchema, MainAnswerVersionSchema, PublicContributionSchema, PublicDebateSchema,
  PublicDigParentSchema, PublicMainAnswerSchema, PurposeLinesSchema, WEB_CONTRACT_LIMITS, WebExplanationSchema, contractInventory,
  type PublicDebate
} from "@debateai/contract";
import { webExtractTextRef, webReplyTextIdOf, webReplyTextRef } from "../../packages/db/src/passage-retention.js";
import { extractCheckedText } from "../../apps/api/src/publication-check/material.js";
import { packetWithPageTexts } from "../../packages/providers/src/sent-form.js";
import { TEAM_FEATURE_PLAN_ID, TEAM_LIMIT_SETTING, teamLimitFromEnvironment, teamLimitWindow, teamRoomMicros } from "../../packages/register/src/team-limit.js";

/**
 * Foundation F1 of R22 (plan 2026-10-31-r22-owner-changes): the shapes the lanes fill. Every member that rides an ask, an answer or a public
 * snapshot is optional, so what was made before reads as before; no score, price or who-paid reaches a public or an answer shape; every new
 * public string is in the HS-S02 lists; three page-note sentences fit; the passage references travel through W3-0's sent form; the team's
 * limit is only a setting. Numbers here are made up.
 */
const VERSION = { version: 1, updated_at: "2026-10-31T10:00:00.000Z", trigger: "PATH_REWRITE", position_ref: "pos-1", segments: [{ text: "Made-up answer." }] };

describe("the ask's new members", () => {
  it("are optional, and an ask without them reads as before", () => {
    for (const key of ["public_parent", "purpose_lines", "free_public_notice"] as const) {
      expect(AskRequestSchema.shape[key].safeParse(undefined).success, key).toBe(true);
    }
  });

  it("purpose lines hold at least one line, each short, nothing else", () => {
    expect(PurposeLinesSchema.safeParse({ place: "In Romania", time: "Now", purpose: "To decide" }).success).toBe(true);
    expect(PurposeLinesSchema.safeParse({ time: "Now" }).success).toBe(true);
    expect(PurposeLinesSchema.safeParse({}).success).toBe(false);
    expect(PurposeLinesSchema.safeParse({ place: "x".repeat(WEB_CONTRACT_LIMITS.purposeLineMaxChars + 1) }).success).toBe(false);
    expect(PurposeLinesSchema.safeParse({ place: "x", extra: "y" }).success).toBe(false);
  });

  it("a stranger's dig names the page, never a run", () => {
    const ok = { public_ref: "00000000-0000-4000-8000-000000000001", places: [], mode: "quick" };
    expect(PublicDigParentSchema.safeParse(ok).success).toBe(true);
    expect(PublicDigParentSchema.safeParse({ ...ok, parent_run_id: ok.public_ref }).success).toBe(false);
  });
});

describe("the main answer on the debate's answer", () => {
  it("current is the newest of the history, or null with none", () => {
    expect(AnswerMainAnswerSchema.safeParse({ current: null, history: [] }).success).toBe(true);
    expect(AnswerMainAnswerSchema.safeParse({ current: VERSION, history: [VERSION] }).success).toBe(true);
    expect(AnswerMainAnswerSchema.safeParse({ current: null, history: [VERSION] }).success).toBe(false);
    expect(AnswerMainAnswerSchema.safeParse({ current: VERSION, history: [{ ...VERSION, version: 2 }, VERSION] }).success).toBe(false);
  });

  it("no shape names a score, a price or who paid", () => {
    const keys = [MainAnswerVersionSchema, PublicContributionSchema, PublicMainAnswerSchema, AnswerContributionSchema]
      .flatMap((schema) => Object.keys(schema.shape));
    expect(keys.filter((key) => /grade|score|strength|price|cost|micros|paid|owner/iu.test(key))).toEqual([]);
  });

  it("the inventory lists every new shape", () => {
    const resources = contractInventory.resources as unknown as Record<string, unknown>;
    for (const [name, schema] of Object.entries({ PurposeLinesSchema, MainAnswerVersionSchema, AnswerMainAnswerSchema, PublicDigParentSchema,
      AnswerContributionSchema, PublicContributionSchema, PublicMainAnswerSchema })) expect(resources[name], name).toBe(schema);
  });
});

describe("the public snapshot's new members", () => {
  const contribution = { position_ref: "pos-1", contributor: null, contributed_on: "2026-10-31", line: "CHECK-line", summary: "CHECK-summary",
    fate: "HELD_UP", what_changed: ["CHECK-changed"] };
  const snapshot = (extra: Record<string, unknown>): unknown => ({
    public_ref: "00000000-0000-4000-8000-000000000001", author_pseudonym: "a-name", question: "Q?", published_at: "2026-10-31T10:00:00.000Z",
    answer: { terminal: "SERVED", verdict: null, verdict_available: false, confidence_band: null, summary_segments: [], badges: [], residual_objections: [],
      reversal_point: "R", as_of: "2026-10-31T10:00:00.000Z" },
    ...extra
  });

  it("an old snapshot parses without them; a contributor may have lost their name", () => {
    expect(PublicDebateSchema.safeParse(snapshot({})).success).toBe(true);
    expect(PublicDebateSchema.safeParse(snapshot({ contributions: [contribution] })).success).toBe(true);
    expect(PublicDebateSchema.safeParse(snapshot({ contributions: [{ ...contribution, contributor: "a-pseudonym" }] })).success).toBe(true);
  });

  it("HS-S02 judges what the contribution wrote, never the name or the date", () => {
    const parsed = PublicDebateSchema.parse(snapshot({
      contributions: [{ ...contribution, contributor: "NAME-excluded" }],
      main_answer_update: { updated_at: "2026-10-31T10:00:00.000Z", segments: [{ text: "CHECK-answer" }] }
    })) as PublicDebate;
    const leaves = extractCheckedText(parsed);
    for (const [kind, text] of [["ARGUMENTS", "CHECK-line"], ["ARGUMENTS", "CHECK-summary"], ["ARGUMENTS", "CHECK-changed"], ["SUMMARY", "CHECK-answer"]]) {
      expect(leaves).toContainEqual({ kind, text });
    }
    expect(leaves.map((leaf) => leaf.text).join(" ")).not.toContain("NAME-excluded");
    expect(leaves.map((leaf) => leaf.text).join(" ")).not.toContain("2026-10-31");
  });
});

describe("the page note and the passage references", () => {
  it("three long sentences of a page note fit the limit", () => {
    const sentence = "A sentence about the page, what it found, in plain words, of a good and honest length for a note like this one here. ";
    expect(WebExplanationSchema.safeParse({ text: sentence.repeat(3).trim(), language: "en" }).success).toBe(true);
    expect(WEB_CONTRACT_LIMITS.explanationMaxChars).toBeGreaterThanOrEqual(5 * 3 * 100);
  });

  it("a recorded reply names only its id, and a passage's reference fills in like a page text's", () => {
    const id = "00000000-0000-4000-8000-0000000000aa";
    expect(webReplyTextIdOf(webReplyTextRef(id))).toBe(id);
    expect(webReplyTextIdOf(`${webReplyTextRef(id)} and more`)).toBeNull();
    expect(() => webReplyTextRef("not-an-id")).toThrow("PASSAGE_REF_ID_INVALID");
    const ref = webExtractTextRef(id);
    const recorded = { messages: [{ role: "user" as const, content: JSON.stringify({ sources: JSON.stringify({ quote: ref }) }) }] };
    const sent = packetWithPageTexts(recorded, new Map([[ref, "A \"passage\" word for word."]]));
    expect(sent.messages[0]!.content).toBe(JSON.stringify({ sources: JSON.stringify({ quote: "A \"passage\" word for word." }) }));
    expect(recorded.messages[0]!.content).not.toContain("word for word");
  });
});

describe("the team's limit", () => {
  it("is a server setting with no default: absent is none, and a bad value stops the boot", () => {
    expect(teamLimitFromEnvironment({})).toBeNull();
    expect(teamLimitFromEnvironment({ [TEAM_LIMIT_SETTING]: "1234" })).toEqual({ monthMicros: 1234 });
    for (const bad of ["", "0", "-1", "12.5", "ten", "99999999999999999"]) {
      expect(() => teamLimitFromEnvironment({ [TEAM_LIMIT_SETTING]: bad }), bad).toThrow("The team limit setting");
    }
  });

  it("counts over the calendar month and never goes below zero; a team debate has the top plan's features", () => {
    expect(TEAM_FEATURE_PLAN_ID).toBe("MAX");
    expect(teamLimitWindow(new Date("2026-12-15T10:00:00Z"))).toEqual({ from: new Date("2026-12-01T00:00:00Z"), to: new Date("2027-01-01T00:00:00Z") });
    expect(teamRoomMicros({ monthMicros: 100 }, 30)).toBe(70);
    expect(teamRoomMicros({ monthMicros: 100 }, 130)).toBe(0);
  });
});
