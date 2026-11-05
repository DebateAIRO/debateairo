import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { StartPaths } from "../../packages/contract/src/index.js";
import type { ContractClient } from "../../packages/contract/src/client.js";
import { createDebate } from "../../apps/ui/lib/api.js";
import { crisisWordsOf } from "../../apps/ui/lib/v4/askText.js";
import { pathPlanFromMenu, pathPlanToStartPaths } from "../../apps/ui/lib/v4/pathPlan.js";
import { NUCLEAR_MENU, START_FIXTURE_QUESTION, signedMenu } from "../support/v4-start-menu.js";

/*
 * V4 start step, Task 68 (read-d2, read-d3, choose-d2, owner answer Q8): the hand-over on the wire. Start carries the
 * question box's line, the proof that the line was checked at Next (`start_check`), the chosen paths and the carry-on
 * box; each member only when the page has it, so an ask with no lane is today's ask byte for byte. A lane that does not
 * parse is refused before anything is sent.
 */
const Q = START_FIXTURE_QUESTION;
const BOX = `${Q}\n\nWhich region? The north.`;
const config = {
  risk_tier: "standard", plan_tier: "premium", tier_source: "ASKER", tier_provenance_ref: "wire", composition_budget_tier: "low",
  as_of: "2026-11-05T10:00:00.000Z", depth: 1, decision_scope: "start lane wire"
} as never;

function wire() {
  const submitAsk = vi.fn(async (_ask: Record<string, unknown>) => ({ run_ref: "run:wire" }));
  const submitAskOrLanguageChoice = vi.fn(async (_ask: Record<string, unknown>) => ({ kind: "ACCEPTED" as const, accepted: { run_ref: "run:wire" } }));
  return { submitAsk, submitAskOrLanguageChoice, client: { submitAsk, submitAskOrLanguageChoice } as unknown as ContractClient };
}

/** The person's five paths at How wide 5, from the shared menu, as the page sends them. */
const START_PATHS: StartPaths = {
  source: "MENU",
  menu: signedMenu(NUCLEAR_MENU),
  paths: [...pathPlanToStartPaths(pathPlanFromMenu(NUCLEAR_MENU, 5, false))],
  width: 5,
  chosen_by: "PERSON"
};
const START_KEYS = ["start_check", "start_paths", "carry_on_to_report"] as const;

describe("createDebate's ninth argument, the start lane", () => {
  it("no lane, or a lane with no member: no start key, the same bytes as today's ask", async () => {
    const today = wire();
    await createDebate(Q, config, "test-token", today.client);
    const empty = wire();
    await createDebate(Q, config, "test-token", empty.client, undefined, undefined, undefined, undefined, {});
    const sent = today.submitAsk.mock.calls[0]![0];
    for (const key of START_KEYS) expect(sent).not.toHaveProperty(key);
    expect(JSON.stringify(empty.submitAsk.mock.calls[0]![0])).toBe(JSON.stringify(sent));
  });

  it("each member the page has goes, under its contract name, and only those", async () => {
    const all = wire();
    await createDebate(BOX, config, "test-token", all.client, undefined, undefined, undefined, undefined,
      { startCheck: { ref: "chk.sig" }, startPaths: START_PATHS, carryOnToReport: true });
    const sent = all.submitAsk.mock.calls[0]![0];
    expect(sent.question_line).toBe(BOX);
    expect(sent.start_check).toEqual({ ref: "chk.sig" });
    expect(sent.start_paths).toEqual(START_PATHS);
    expect(sent.carry_on_to_report).toBe(true);

    const checkOnly = wire();
    await createDebate(Q, config, "test-token", checkOnly.client, undefined, undefined, undefined, undefined, { startCheck: { ref: "chk.sig" } });
    const alone = checkOnly.submitAsk.mock.calls[0]![0];
    expect(alone.start_check).toEqual({ ref: "chk.sig" });
    expect(alone).not.toHaveProperty("start_paths");
    expect(alone).not.toHaveProperty("carry_on_to_report");
  });

  it("start_check is {ref} or {ref, original_question_line}, never with another key", async () => {
    const plain = wire();
    await createDebate(Q, config, "test-token", plain.client, undefined, undefined, undefined, undefined, { startCheck: { ref: "chk.sig" } });
    expect(Object.keys(plain.submitAsk.mock.calls[0]![0].start_check as object)).toEqual(["ref"]);

    const rewritten = wire();
    await createDebate("Should Romania build more nuclear plants?", config, "test-token", rewritten.client, undefined, undefined, undefined, undefined,
      { startCheck: { ref: "chk2.sig", original_question_line: Q } });
    expect(rewritten.submitAsk.mock.calls[0]![0].start_check).toEqual({ ref: "chk2.sig", original_question_line: Q });
    expect(Object.keys(rewritten.submitAsk.mock.calls[0]![0].start_check as object).sort()).toEqual(["original_question_line", "ref"]);

    const extra = wire();
    await expect(createDebate(Q, config, "test-token", extra.client, undefined, undefined, undefined, undefined,
      { startCheck: { ref: "chk.sig", menu_ref: "menu1.sig" } as never })).rejects.toThrow();
    expect(extra.submitAsk).not.toHaveBeenCalled();
  });

  it("a malformed lane is refused before anything is sent", async () => {
    const malformed = [
      { startCheck: { ref: "no signature" } },
      { startPaths: { ...START_PATHS, width: 3 } },
      { startPaths: { ...START_PATHS, menu: undefined } },
      { carryOnToReport: false }
    ];
    for (const lane of malformed) {
      const sent = wire();
      await expect(createDebate(Q, config, "test-token", sent.client, undefined, undefined, undefined, undefined, lane as never), JSON.stringify(Object.keys(lane)))
        .rejects.toThrow();
      expect(sent.submitAsk).not.toHaveBeenCalled();
    }
  });

  it("the lane rides with the question-language call too", async () => {
    const sent = wire();
    await createDebate(BOX, config, "test-token", sent.client, { siteLanguage: "en" }, undefined, undefined, undefined, { startCheck: { ref: "chk.sig" } });
    expect(sent.submitAsk).not.toHaveBeenCalled();
    expect(sent.submitAskOrLanguageChoice.mock.calls[0]![0].start_check).toEqual({ ref: "chk.sig" });
  });
});

describe("crisisWordsOf reads the person's own path words too", () => {
  const OWN = ["My own path, in my words", "What I worry about"];
  it("a new question: the question as typed, then the own words", () => {
    expect(crisisWordsOf("ask", BOX, null, OWN)).toEqual([BOX, ...OWN]);
  });
  it("a dig: the person's own views, then the own words; never the AI-written question", () => {
    const parent = { picks: [{ kind: "OWN_VIEW", text: "my view" }, { kind: "SUGGESTION", text: "an AI's words" }] };
    expect(crisisWordsOf("dig", "the dig's AI-written question", parent, OWN)).toEqual(["my view", ...OWN]);
  });
  it("without own words, today's answer", () => {
    expect(crisisWordsOf("ask", Q, null)).toEqual([Q]);
    expect(crisisWordsOf("ask", Q, null, [])).toEqual([Q]);
    expect(crisisWordsOf("dig", "x", null, [])).toEqual([]);
  });
});

describe("the hand-over's lines (draft wording, answer Q8)", () => {
  const catalog = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
  it("the plan-change line and the narrowed lines, word for word", () => {
    expect(catalog["v4.start.readAgainNeeded"]).toBe("We need to read your question again. Press Back, then Next.");
    expect(catalog["v4.start.narrowed.one"])
      .toBe("We've updated the site: it now looks into up to {count} path. Combine or remove paths down to {count} to start.");
    expect(catalog["v4.start.narrowed.other"])
      .toBe("We've updated the site: it now looks into up to {count} paths. Combine or remove paths down to {count} to start.");
  });
  it("no 'allowance', no out-of-date key and no 'Read it again' (suggestions never go out of date by time)", () => {
    const start = Object.entries(catalog).filter(([key]) => key.startsWith("v4.start."));
    expect(start.length).toBeGreaterThan(0);
    expect(start.filter(([, value]) => /allowance/iu.test(value))).toEqual([]);
    expect(start.filter(([, value]) => /read it again/iu.test(value))).toEqual([]);
    expect(Object.keys(catalog).filter((key) => key.startsWith("v4.start.outdated"))).toEqual([]);
  });
});
