/**
 * S1a — a moment is the live prompt, so it carries the question's language (dev's
 * argument-language rule, D2). A moment written before the merge names none and
 * reads as dev's default; one exported from a run in another language names it,
 * and the live builders build in it.
 */
import { describe, expect, it } from "vitest";
import { argumentLanguageDirective, type DebateRole } from "@debateai/kernel";
import type { MomentBuilder } from "@debateai/scorecard";
import {
  builderFromRecordedPacket,
  captureMomentPacket,
  momentArgumentLanguageName,
  parseMomentBuilder
} from "../../acceptance/moment-tools.js";

const QUESTION = "Should the town rebuild the old bridge?";
const DEFAULT_NAME = "the same language as the question";
const promptText = (packet: { readonly messages: readonly { readonly content: string }[] }): string =>
  packet.messages.map((message) => message.content).join("\n");

const CASES: readonly (readonly [DebateRole, string, MomentBuilder])[] = [
  ["POSITION", "JUDGE:seat:main", { family: "JUDGE_JUDGE", inputs: { questionLine: QUESTION, leg: { kind: "primary-root" } } }],
  ["SUPPORT_ATTACK", "JUDGE:defender:root0:r1:p0:seat:main", {
    family: "JUDGE_JUDGE", inputs: { questionLine: QUESTION, leg: { kind: "support", positionUnderDebate: "Rebuild it." } }
  }],
  ["JUDGE", "PANEL:root:provider:a:seat:main", { family: "JUDGE_ASSESS", inputs: { questionLine: QUESTION, statement: "Rebuild it." } }],
  ["REVIEWER", "JUDGE:review:node-1:seat:main", {
    family: "JUDGE_REVIEW", inputs: { questionLine: QUESTION, statement: "Rebuild it.", edges: [] }
  }]
];

describe("S1a · a moment carries the question's language", () => {
  it("reads a moment written before the merge (no language named) as dev's default", async () => {
    const typed = parseMomentBuilder(CASES[2]![2], "JUDGE");
    expect(momentArgumentLanguageName(typed)).toBe(DEFAULT_NAME);
    expect(promptText(await captureMomentPacket(typed))).toContain(argumentLanguageDirective(DEFAULT_NAME));
  });

  it.each(CASES)("%s at %s: builds in the language the moment names, and reads it back from the recorded packet", async (role, key, builder) => {
    const typed = parseMomentBuilder({ ...builder, inputs: { ...(builder.inputs as object), argumentLanguageName: "Romanian" } }, role);
    expect(momentArgumentLanguageName(typed)).toBe("Romanian");
    const packet = await captureMomentPacket(typed);
    expect(promptText(packet)).toContain(argumentLanguageDirective("Romanian"));
    expect(promptText(packet)).not.toContain(argumentLanguageDirective(DEFAULT_NAME));
    expect(builderFromRecordedPacket(role, key, packet, "Romanian")).toEqual(typed);
  });

  it("names no language for a run in dev's default, so a default-language moment keeps its id", async () => {
    const typed = parseMomentBuilder(CASES[0]![2], "POSITION");
    const packet = await captureMomentPacket(typed);
    expect(builderFromRecordedPacket("POSITION", "JUDGE:seat:main", packet, DEFAULT_NAME).inputs).not.toHaveProperty("argumentLanguageName");
  });

  it("refuses a blank language name rather than fall back silently", () => {
    expect(() => parseMomentBuilder({ family: "JUDGE_ASSESS", inputs: { questionLine: QUESTION, statement: "x", argumentLanguageName: " " } }))
      .toThrowError(expect.objectContaining({ code: "MOMENT_BUILDER_INVALID" }));
  });
});
