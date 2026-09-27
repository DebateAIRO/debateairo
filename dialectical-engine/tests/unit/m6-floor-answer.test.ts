import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ContractHttpError, type Answer, type AnswerDisclosure, type AnswerFloor, type ContractClient } from "@debateai/contract";
import { getDebateBundle } from "../../apps/ui/lib/api.js";
import { getDebateServer } from "../../apps/ui/lib/serverApi.js";
import { floorAnswerView, publicFloorHost, readAnswerFloor, resolveFloor } from "../../apps/ui/lib/v3/floorAnswer.js";
import { STORY_FIXTURE_ANSWER, STORY_FIXTURE_DEBATE_ID, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import { toStoryView } from "../../apps/ui/lib/v3/storyView.js";

/**
 * Task M6 (spec 2026-09-26 §14.4.4): a components-only answer whose label the
 * engine kept (the floor, Task M5) is shown as an answer: the label in human
 * words, "Our best answer:", and the leading position's own statement. These
 * are the page's pure parts and its reads.
 */

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalog = (locale: string, namespace = "public"): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
const en = catalog("en");
const ro = catalog("ro");

const LEADING = STORY_FIXTURE_ANSWER.nodes.find((node) => node.node_id === "n-hybrid")!;

/** The Romanian fixture as an answer that ended components-only: no label of its own, no prose. */
const FLOOR_ANSWER: Answer = {
  ...STORY_FIXTURE_ANSWER,
  terminal: "COMPONENTS_ONLY",
  serve_state: "COMPONENTS_ONLY",
  verdict_state: null,
  verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_ENVELOPE" },
  confidence_band: null,
  band_ceiling: null,
  composed_text: []
};

const FLOOR: AnswerFloor = { verdict_state: "CONTESTED", leading_node_id: "n-hybrid", basis_incomplete: false };
const THIN_FLOOR: AnswerFloor = { ...FLOOR, basis_incomplete: true };

function disclosureOf(floor: AnswerFloor | null): AnswerDisclosure {
  return {
    answer_id: STORY_FIXTURE_DEBATE_ID,
    answer_version: 1,
    floor,
    floor_reason: floor === null ? null : "ENVELOPE_EXHAUSTED",
    writer: null,
    checker: null,
    checker_same_as_writer: false,
    digest: null,
    cut_short: { arguing: "MONEY", answer_writing: "MONEY" }
  };
}

const ownerHost = (answer: Answer) => ({ terminal: answer.terminal, verdict: answer.verdict_state, nodes: answer.nodes });

describe("the floor, resolved against the answer it belongs to", () => {
  it("takes the label and the leading position's own statement for a components-only answer", () => {
    expect(resolveFloor(ownerHost(FLOOR_ANSWER), THIN_FLOOR)).toEqual({
      label: "CONTESTED",
      leadingNodeId: "n-hybrid",
      statement: LEADING.claim,
      basisIncomplete: true
    });
  });

  it("is nothing without a floor, for an answer with a label of its own, or when the position is not in the answer", () => {
    expect(resolveFloor(ownerHost(FLOOR_ANSWER), null)).toBeNull();
    expect(resolveFloor(ownerHost(FLOOR_ANSWER), undefined)).toBeNull();
    expect(resolveFloor(null, FLOOR)).toBeNull();
    // A served answer carries its own label: a floor never stands in for it.
    expect(resolveFloor(ownerHost(STORY_FIXTURE_ANSWER), FLOOR)).toBeNull();
    expect(resolveFloor(ownerHost({ ...FLOOR_ANSWER, verdict_state: "SUPPORTED" }), FLOOR)).toBeNull();
    expect(resolveFloor(ownerHost(FLOOR_ANSWER), { ...FLOOR, leading_node_id: "n-missing" })).toBeNull();
  });

  it("reads a public snapshot's answer the same way", () => {
    const host = publicFloorHost({ terminal: "COMPONENTS_ONLY", verdict: null, nodes: FLOOR_ANSWER.nodes.map((node) => ({ ...node, disagreement: null })) });
    expect(resolveFloor(host, FLOOR)?.statement).toBe(LEADING.claim);
    expect(resolveFloor(publicFloorHost({ terminal: "COMPONENTS_ONLY", verdict: null }), FLOOR)).toBeNull();
  });
});

describe("the floor's words come from the catalogue handed in", () => {
  it("says the label in human words, 'Our best answer:', and the statement, in English", () => {
    const view = floorAnswerView(resolveFloor(ownerHost(FLOOR_ANSWER), FLOOR)!, en, "en", "ro");
    expect(view).toEqual({
      locale: "en",
      direction: "ltr",
      statementLocale: "ro",
      statementDirection: "ltr",
      verdictState: "contested",
      labelWords: en["public.story.label.contested"],
      lead: en["public.story.floorLead"],
      statement: LEADING.claim,
      thinBasis: null
    });
    expect(view.lead).toBe("Our best answer:");
  });

  it("adds the thin-basis line only when the label rests on less than usual, in Romanian", () => {
    const view = floorAnswerView(resolveFloor(ownerHost(FLOOR_ANSWER), THIN_FLOOR)!, ro, "ro", "ro");
    expect(view.labelWords).toBe("Decizie strânsă");
    expect(view.lead).toBe(ro["public.story.floorLead"]);
    expect(view.thinBasis).toBe(ro["public.story.floorThinBasis"]);
    expect(view.thinBasis).not.toBe(en["public.story.floorThinBasis"]);
  });
});

describe("reading the floor (GET /v1/answers/{id}/disclosure)", () => {
  it("reads only a components-only answer's record", async () => {
    const calls: string[] = [];
    const client = {
      readAnswerDisclosure: async (id: string) => { calls.push(id); return disclosureOf(FLOOR); }
    };
    expect(await readAnswerFloor(client, FLOOR_ANSWER)).toEqual({ floor: FLOOR, failed: false });
    expect(await readAnswerFloor(client, STORY_FIXTURE_ANSWER)).toEqual({ floor: null, failed: false });
    expect(calls).toEqual([STORY_FIXTURE_DEBATE_ID]);
  });

  it("treats DISCLOSURE_NOT_FOUND as no floor, and any other failure as no floor it could read", async () => {
    const notFound = { readAnswerDisclosure: async () => { throw new ContractHttpError("NOT_FOUND", 404, "DISCLOSURE_NOT_FOUND"); } };
    const broken = { readAnswerDisclosure: async () => { throw new ContractHttpError("SERVER_FAILURE", 500, "boom"); } };
    const missing = {} as Pick<ContractClient, "readAnswerDisclosure">;
    expect(await readAnswerFloor(notFound, FLOOR_ANSWER)).toEqual({ floor: null, failed: false });
    expect(await readAnswerFloor(broken, FLOOR_ANSWER)).toEqual({ floor: null, failed: true });
    expect(await readAnswerFloor(missing, FLOOR_ANSWER)).toEqual({ floor: null, failed: true });
  });

  it("reads the floor on the server beside the run, in parallel, not after it", async () => {
    const started: string[] = [];
    let releaseRun: (() => void) | null = null;
    const client = {
      readAnswer: async () => FLOOR_ANSWER,
      readRun: () => {
        started.push("run");
        return new Promise((done) => {
          releaseRun = () => done({
            run_ref: FLOOR_ANSWER.run_ref, question_line: FLOOR_ANSWER.question_line, state: "SETTLED",
            terminal_reason: null, hold_until: null, argument_language: { tag: "ro", name: "Romanian" }
          });
        });
      },
      readAnswerDisclosure: async () => { started.push("disclosure"); return disclosureOf(THIN_FLOOR); }
    } as unknown as ContractClient;
    const pending = getDebateServer(STORY_FIXTURE_DEBATE_ID, "token", client);
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
    expect(started).toEqual(["run", "disclosure"]);
    releaseRun!();
    const result = await pending;
    expect(result).toMatchObject({ ok: true, floor: THIN_FLOOR, questionLanguage: { tag: "ro" } });
  });

  it("gives a served answer's server read no floor, and never reads a record for it", async () => {
    let read = false;
    const client = {
      readAnswer: async () => STORY_FIXTURE_ANSWER,
      readRun: async () => ({ run_ref: "r", question_line: "q", state: "SETTLED", terminal_reason: null, hold_until: null }),
      readAnswerDisclosure: async () => { read = true; return disclosureOf(null); }
    } as unknown as ContractClient;
    expect(await getDebateServer(STORY_FIXTURE_DEBATE_ID, "token", client)).toMatchObject({ ok: true, floor: null });
    expect(read).toBe(false);
  });

  it("keeps the page as today when the server's read of the record fails", async () => {
    const client = {
      readAnswer: async () => FLOOR_ANSWER,
      readRun: async () => ({ run_ref: "r", question_line: "q", state: "SETTLED", terminal_reason: null, hold_until: null }),
      readAnswerDisclosure: async () => { throw new ContractHttpError("SERVER_FAILURE", 500, "boom"); }
    } as unknown as ContractClient;
    expect(await getDebateServer(STORY_FIXTURE_DEBATE_ID, "token", client)).toMatchObject({ ok: true, floor: null });
  });

  it("carries the floor read on the client's served bundle", async () => {
    const client = {
      readRun: async () => ({ run_ref: FLOOR_ANSWER.run_ref, question_line: "q", state: "SETTLED", terminal_reason: null, hold_until: null }),
      readRunAnswer: async () => FLOOR_ANSWER,
      readAnswerDisclosure: async () => disclosureOf(FLOOR)
    } as unknown as ContractClient;
    expect(await getDebateBundle(FLOOR_ANSWER.run_ref, "token", client))
      .toMatchObject({ kind: "served", floorRead: { floor: FLOOR, failed: false } });
    const failing = { ...client, readAnswerDisclosure: async () => { throw new Error("boom"); } } as unknown as ContractClient;
    expect(await getDebateBundle(FLOOR_ANSWER.run_ref, "token", failing))
      .toMatchObject({ kind: "served", floorRead: { floor: null, failed: true } });
  });
});

describe("the story strip of a floor answer", () => {
  const resolved = resolveFloor(ownerHost(FLOOR_ANSWER), THIN_FLOOR);

  it("takes its label from the floor when the answer carries none", () => {
    for (const status of ["WRITING", "READY", "UNAVAILABLE"] as const) {
      const view = toStoryView(FLOOR_ANSWER, storyFixture(status), STORY_FIXTURE_DEBATE_ID, "ro", () => true, resolved);
      expect(view.label, status).toBe("CONTESTED");
      expect(view.verdictState, status).toBe("contested");
    }
  });

  it("holds the floor answer as the interim text before the story arrives, and when there is none", () => {
    for (const status of ["WRITING", "UNAVAILABLE"] as const) {
      const view = toStoryView(FLOOR_ANSWER, storyFixture(status), STORY_FIXTURE_DEBATE_ID, "ro", () => true, resolved);
      expect(view.fallbackText, status).toBeNull();
      expect(view.floor, status).toEqual(resolved);
    }
    expect(toStoryView(FLOOR_ANSWER, storyFixture("READY"), STORY_FIXTURE_DEBATE_ID, "ro", () => true, resolved).floor).toBeNull();
  });

  it("changes nothing for an answer without a floor", () => {
    const view = toStoryView(FLOOR_ANSWER, storyFixture("WRITING"), STORY_FIXTURE_DEBATE_ID, "ro");
    expect([view.label, view.verdictState, view.floor]).toEqual([null, null, null]);
    expect(toStoryView(STORY_FIXTURE_ANSWER, storyFixture("READY"), STORY_FIXTURE_DEBATE_ID, "ro").label).toBe("CONTESTED");
  });
});
