import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PublicDebateSchema, type PublicDebate } from "../../packages/contract/src/index.js";
import { assertFramedPrompt, buildFramedPrompt } from "../../packages/providers/src/prompt-frame.js";
import cases from "../../acceptance/fixtures/hs-s02-cases.json" with { type: "json" };
import type { PublicationCheckRecord, PublicationJudgePort } from "../../apps/api/src/publication-check/check.js";

const paths = [
  ["question", "QUESTION"],
  ["answer.confidence_band", "SUMMARY"], ["answer.summary_segments[].text", "SUMMARY"],
  ["answer.badges[]", "SUMMARY"], ["answer.residual_objections[]", "SUMMARY"], ["answer.reversal_point", "SUMMARY"],
  ...["claim", "base_score.kind", "base_score.source", "base_score.producer", "base_score.replay_handle",
    "final_strength.kind", "final_strength.source", "final_strength.producer", "final_strength.replay_handle",
    "locator", "abstention.question_class", "abstention.register_row_key", "abstention.unlock_condition"]
    .map(p => [`answer.nodes[].${p}`, "ARGUMENTS"]),
  ["answer.nodes[].review.reasons[]", "REVIEWS"],
  ...["headline", "summary", "confidence", "paths[].line", "change.text", "reviewer_note.text"]
    .map(p => [`story_short.${p}`, "STORY"])
] as const;
const kinds = ["QUESTION", "SUMMARY", "ARGUMENTS", "REVIEWS", "STORY"];
function setPath(root: Record<string, any>, path: string, value: string) {
  const tokens = path.replaceAll("[]", ".0").split(".");
  let node = root;
  tokens.forEach((key, i) => {
    if (i === tokens.length - 1) node[key] = value;
    else node = node[key] ??= tokens[i + 1] === "0" ? [] : {};
  });
}
function snapshot(markers = false): PublicDebate {
  const root: Record<string, any> = {};
  for (const [path] of paths) setPath(root, path, markers ? `HS-MARK-${path}` : cases[8]!.text);
  for (const path of ["public_ref", "author_pseudonym", "answer.nodes[].node_id", "answer.nodes[].provenance_ref",
    "answer.edges[].strength.number.source", "answer.nodes[].maker_lineage.model_id", "story_short.paths[].position_ref"])
    setPath(root, path, `EXCLUDED-${path}`);
  return root as PublicDebate;
}
function walk(schema: any, path = ""): { path: string; type: string }[] {
  const d = schema.def;
  if (["optional", "nullable", "default", "readonly"].includes(d.type)) return walk(d.innerType, path);
  if (d.type === "object") return Object.entries(d.shape).flatMap(([k, v]) => walk(v, path ? `${path}.${k}` : k));
  if (d.type === "array") return walk(d.element, `${path}[]`);
  if (d.type === "union") return d.options.flatMap((v: any) => walk(v, path));
  if (["string", "enum", "literal"].includes(d.type)) return [{ path, type: d.type }];
  return [];
}
const allow = { verdict: "ALLOW", rules: [], parts: [], possibly_illegal: false };
const block = { verdict: "BLOCK", rules: [1], parts: ["question"], possibly_illegal: true };
const unsure = { verdict: "UNSURE", rules: [], parts: ["question"], possibly_illegal: false };

describe("policy", () => {
  // Property: the framed judge keeps the verbatim policy, and its version identifies the contract.
  it("carries both rules and the text of record through the door", async () => {
    const p = await import("../../apps/api/src/publication-check/policy.js");
    const rule1 = "1. Never produce content that attacks, dehumanises, or incites hatred, discrimination or violence against people because of race, colour, ethnicity, national origin, descent, language, religion, sex, gender identity, sexual orientation, age, disability, health status, social origin or political opinion. Do not call a group vermin, disease or subhuman; do not claim a group is inferior by nature; do not call for its exclusion, expulsion or harm.";
    const rule2 = "2. Never deny, justify or trivialise the Holocaust or other genocides and crimes against humanity established by courts. You may analyse historical and legal debates about how events are classified.";
    const record = "Judge the text by what it does, not by the words it contains. Text that quotes hateful statements in order to analyse or refute them, explains what a slur means, debates how historical events are legally classified, or argues a policy position is ALLOWED. Answer BLOCK when any part itself does what rule 1 or rule 2 forbids. Answer UNSURE when you cannot decide between ALLOW and BLOCK. Answer ALLOW otherwise. Set possibly_illegal to true only when the text publicly incites violence or hatred against a group or denies, justifies or grossly trivialises a genocide or crime against humanity established by a court.";
    for (const text of [rule1, rule2, record]) expect(p.publicationCheckContract().instruction).toContain(text);
    expect(() => assertFramedPrompt(buildFramedPrompt({ contract: p.publicationCheckContract(), material: [{ name: "question", content: "x" }] }).packet)).not.toThrow();
    expect(p.PUBLICATION_CHECK_POLICY_VERSION).toMatch(/^publication\.content-check\.v1@[0-9a-f]{16}$/);
  });
  // Property: integration cannot leave a second product copy of the content rule.
  it("has one product source for the rule", async () => {
    await import("../../apps/api/src/publication-check/policy.js");
    const files = execFileSync("rg", ["--files", "apps", "packages", "-g", "*.ts", "-g", "*.tsx", "-g", "*.mjs", "-g", "*.js",
      "-g", "!**/node_modules/**", "-g", "!**/generated/**", "-g", "!**/.next/**", "-g", "!*.test.*"], { encoding: "utf8" }).trim().split("\n");
    expect(files.filter(f => readFileSync(f, "utf8").includes("Never produce content that attacks, dehumanises, or incites hatred"))).toHaveLength(1);
  });
});

describe("R2", () => {
  // Property: every schema string is explicitly checked or explicitly excluded, exclusively.
  it("covers the schema with 26 checked paths and 36 excluded strings", async () => {
    const m = await import("../../apps/api/src/publication-check/material.js");
    expect(m.CHECKED_TEXT_PATHS).toEqual(paths.map(([path, kind]) => ({ path, kind })));
    const leaves = walk(PublicDebateSchema).filter(l => l.type === "string");
    expect(leaves).toHaveLength(62);
    expect(leaves.filter(l => m.isExcludedTextPath(l.path, l.type))).toHaveLength(36);
    for (const leaf of walk(PublicDebateSchema)) {
      const checked = m.CHECKED_TEXT_PATHS.some(p => p.path === leaf.path);
      expect(Number(checked) + Number(m.isExcludedTextPath(leaf.path, leaf.type)), leaf.path).toBe(1);
    }
    expect(m.isExcludedTextPath("answer.new_text_field", "string")).toBe(false);
    expect(m.CHECKED_TEXT_PATHS.some(p => p.path === "answer.new_text_field")).toBe(false);
  });
  // Property: allow-listed values all reach material, in order; excluded identifiers do not.
  it("copies every marked leaf in path order, excluding identifiers and null leaves", async () => {
    const m = await import("../../apps/api/src/publication-check/material.js");
    const leaves = m.extractCheckedText(snapshot(true));
    expect(leaves).toEqual(paths.map(([path, kind]) => ({ kind, text: `HS-MARK-${path}` })));
    const calls = m.packJudgeCalls(leaves);
    expect(calls).toHaveLength(1);
    const text = JSON.stringify(calls);
    for (const [path] of paths) expect(text).toContain(`HS-MARK-${path}`);
    expect(text).not.toContain("EXCLUDED-");
    expect(m.extractCheckedText({ question: "q", answer: { confidence_band: null } } as PublicDebate)).toEqual([{ kind: "QUESTION", text: "q" }]);
  });
  // Property: chunking preserves Unicode and every byte of each leaf within the material budget.
  it("packs long and many leaves without exceeding the code-point budget", async () => {
    const { packJudgeCalls } = await import("../../apps/api/src/publication-check/material.js");
    const claim = "😀".repeat(30_000);
    const calls = packJudgeCalls([{ kind: "ARGUMENTS", text: claim }]);
    expect(calls).toHaveLength(3);
    expect(calls.flatMap(c => c.fields.map(f => f.content)).join("")).toBe(claim);
    for (const c of calls) expect(c.fields.reduce((n, f) => n + [...f.content].length, 0)).toBeLessThanOrEqual(12_000);
    const many = packJudgeCalls(Array.from({ length: 50 }, () => ({ kind: "ARGUMENTS" as const, text: "x".repeat(1_000) })));
    expect(many).toHaveLength(5);
    for (const c of many) expect(c.fields.reduce((n, f) => n + [...f.content].length, 0)).toBeLessThanOrEqual(12_000);
    expect(packJudgeCalls([{ kind: "QUESTION", text: "aa" }, { kind: "QUESTION", text: "bb" }], 6)).toEqual([{ fields: [{ name: "question", content: "aa\n\nbb" }] }]);
  });
});

describe("R5 answer validator", () => {
  // Property: only the closed answer schema and the permitted verdict combinations are accepted.
  const table: [string, string, string | null][] = [
    ["ALLOW", JSON.stringify(allow), null], ["BLOCK", JSON.stringify(block), null],
    ["UNSURE with parts", JSON.stringify(unsure), null], ["UNSURE empty", JSON.stringify({ ...unsure, parts: [] }), null],
    ["one fence", "```json\n" + JSON.stringify(block) + "\n```", null],
    ["ALLOW rules", JSON.stringify({ ...allow, rules: [1] }), "JUDGE_ANSWER_SCHEMA"],
    ["ALLOW parts", JSON.stringify({ ...allow, parts: ["question"] }), "JUDGE_ANSWER_SCHEMA"],
    ["ALLOW illegal", JSON.stringify({ ...allow, possibly_illegal: true }), "JUDGE_ANSWER_SCHEMA"],
    ["BLOCK no rules", JSON.stringify({ ...block, rules: [] }), "JUDGE_ANSWER_SCHEMA"],
    ["BLOCK no parts", JSON.stringify({ ...block, parts: [] }), "JUDGE_ANSWER_SCHEMA"],
    ["UNSURE rules", JSON.stringify({ ...unsure, rules: [1] }), "JUDGE_ANSWER_SCHEMA"],
    ["extra reason", JSON.stringify({ ...allow, reason: "secret" }), "JUDGE_ANSWER_SCHEMA"],
    ["unknown rule", JSON.stringify({ ...block, rules: [3] }), "JUDGE_ANSWER_SCHEMA"],
    ["unknown part", JSON.stringify({ ...block, parts: ["story"] }), "JUDGE_ANSWER_UNKNOWN_PART"],
    ["prose", "answer: " + JSON.stringify(allow), "JUDGE_ANSWER_NOT_JSON"],
    ["two fences", "```\n" + JSON.stringify(allow) + "\n```\n```\n{}\n```", "JUDGE_ANSWER_NOT_JSON"],
    ["duplicate rules", JSON.stringify({ ...block, rules: [1, 1] }), "JUDGE_ANSWER_SCHEMA"],
    ["duplicate parts", JSON.stringify({ ...block, parts: ["question", "question"] }), "JUDGE_ANSWER_SCHEMA"],
    ["wrong flag type", JSON.stringify({ ...allow, possibly_illegal: "false" }), "JUDGE_ANSWER_SCHEMA"],
    ["array verdict", JSON.stringify({ ...allow, verdict: ["ALLOW"] }), "JUDGE_ANSWER_SCHEMA"],
    ["null", "null", "JUDGE_ANSWER_SCHEMA"], ["array", "[]", "JUDGE_ANSWER_SCHEMA"]
  ];
  it.each(table)("%s", async (_name, text, cause) => {
    const { parseJudgeAnswer } = await import("../../apps/api/src/publication-check/verdict.js");
    const result = parseJudgeAnswer(text, ["question"]);
    if (cause) expect(result).toEqual({ ok: false, cause });
    else expect(result).toEqual({ ok: true, answer: JSON.parse(text.startsWith("```") ? text.split("\n")[1]! : text) });
  });
});

describe("R6 combination", () => {
  // Property: severity is independent of completion order and unions only the winning verdict's evidence.
  it("uses BLOCK > UNSURE > UNAVAILABLE > ALLOW, with ordered failure provenance", async () => {
    const { combineJudgeCalls } = await import("../../apps/api/src/publication-check/verdict.js");
    const a = { ok: true as const, answer: allow as any }, u = { ok: true as const, answer: unsure as any };
    const b = { ok: true as const, answer: block as any };
    const f = { ok: false as const, cause: "JUDGE_HTTP_STATUS" as const };
    expect(combineJudgeCalls([a, u, b])).toEqual({ outcome: "BLOCK", rules: [1], parts: ["question"], possibly_illegal: true });
    expect(combineJudgeCalls([a, f])).toEqual({ outcome: "UNAVAILABLE", cause: "JUDGE_HTTP_STATUS", rules: [], parts: [], possibly_illegal: false });
    expect(combineJudgeCalls([u, f])).toEqual({ outcome: "UNSURE", rules: [], parts: ["question"], possibly_illegal: false });
    expect(combineJudgeCalls([f, { ok: false, cause: "JUDGE_DEADLINE" }])).toMatchObject({ cause: "JUDGE_HTTP_STATUS" });
    expect(combineJudgeCalls([{ ok: true, answer: { ...block, possibly_illegal: false } as any },
      { ok: true, answer: { ...block, rules: [2], parts: ["arguments"] } as any }])).toEqual({ outcome: "BLOCK", rules: [1, 2], parts: ["question", "arguments"], possibly_illegal: true });
  });
});

describe("check", () => {
  const runId = "PRIVATE-RUN-ID";
  const now = new Date("2026-09-29T00:00:00.000Z");
  // Property: every outcome resolves only after its exact content-free record is written.
  it.each(["ALLOW", "BLOCK", "UNSURE", "UNAVAILABLE"] as const)("records %s", async outcome => {
    const c = await import("../../apps/api/src/publication-check/check.js");
    const p = await import("../../apps/api/src/publication-check/policy.js");
    const { createJudgeStub } = await import("../support/hs-s02-judge-stub.js");
    const judge = createJudgeStub([outcome === "UNAVAILABLE" ? new c.PublicationJudgeFailure("JUDGE_HTTP_STATUS") : JSON.stringify(outcome === "ALLOW" ? allow : outcome === "BLOCK" ? block : unsure)]);
    const rows: unknown[] = [];
    const check = c.createPublicationContentCheck({ judge: () => judge, clock: () => now, recorder: { async record(row) { rows.push(row); } } });
    const input = snapshot(); input.question = "HSCANARY-question";
    const result = await check.check({ runId, snapshot: input });
    const refusal = outcome === "BLOCK" || outcome === "UNSURE";
    const ground = outcome === "BLOCK" ? "TERMS_AND_POSSIBLY_ILLEGAL" : outcome === "UNSURE" ? "TERMS" : null;
    expect(result).toEqual(refusal ? { outcome, statement: { outcome, parts: ["QUESTION"], ground, automated: true, visibility: "PRIVATE" } } : outcome === "ALLOW" ? { outcome } : { outcome, cause: "JUDGE_HTTP_STATUS" });
    expect(rows).toEqual([{ run_id: runId, attempted_at: now, outcome, failure_cause: outcome === "UNAVAILABLE" ? "JUDGE_HTTP_STATUS" : null,
      rules: outcome === "BLOCK" ? [1] : [], part_kinds: refusal ? ["QUESTION"] : [], ground,
      judge_provider_ref: "test:judge", judge_model_id: "test-model", policy_version: p.PUBLICATION_CHECK_POLICY_VERSION, judge_call_count: 1 }]);
    expect(JSON.stringify(rows)).not.toContain("HSCANARY");
  });
  // Property: each failure class has its own stable unavailable cause and is recorded once.
  it.each(["JUDGE_NOT_CONFIGURED", "JUDGE_DOOR_REFUSED", "JUDGE_TRANSPORT_FAILED", "JUDGE_HTTP_STATUS", "JUDGE_DEADLINE",
    "JUDGE_ANSWER_NOT_JSON", "JUDGE_ANSWER_SCHEMA", "JUDGE_ANSWER_UNKNOWN_PART"] as const)("fails closed: %s", async cause => {
    const c = await import("../../apps/api/src/publication-check/check.js");
    const { createJudgeStub } = await import("../support/hs-s02-judge-stub.js");
    const reply = cause === "JUDGE_ANSWER_NOT_JSON" ? "I cannot help" : cause === "JUDGE_ANSWER_SCHEMA" ? JSON.stringify({ ...allow, rules: [1] }) : cause === "JUDGE_ANSWER_UNKNOWN_PART" ? JSON.stringify({ ...block, parts: ["story"] }) : cause === "JUDGE_DEADLINE" ? (() => new Promise<never>(() => {})) : new c.PublicationJudgeFailure(cause);
    const judge = createJudgeStub([reply]);
    const rows: PublicationCheckRecord[] = [];
    const checker = c.createPublicationContentCheck({ judge: () => cause === "JUDGE_NOT_CONFIGURED" ? null : judge, clock: () => now, deadlineMs: 50, recorder: { async record(row) { rows.push(row); } } });
    const start = performance.now();
    expect(await checker.check({ runId, snapshot: { question: cases[0]!.text } as PublicDebate })).toEqual({ outcome: "UNAVAILABLE", cause });
    expect(performance.now() - start).toBeLessThan(1_000);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ failure_cause: cause, judge_call_count: cause === "JUDGE_NOT_CONFIGURED" ? 0 : 1,
      judge_provider_ref: cause === "JUDGE_NOT_CONFIGURED" ? null : "test:judge", judge_model_id: cause === "JUDGE_NOT_CONFIGURED" ? null : "test-model" });
    expect(judge.packets).toHaveLength(cause === "JUDGE_NOT_CONFIGURED" ? 0 : 1);
  });
  // Property: the only judge material is checked content, framed through the common door.
  it("sends every checked leaf with no identifiers and supplies all kinds for empty UNSURE parts", async () => {
    const c = await import("../../apps/api/src/publication-check/check.js");
    const m = await import("../../apps/api/src/publication-check/material.js");
    const { createJudgeStub } = await import("../support/hs-s02-judge-stub.js");
    const judge = createJudgeStub([JSON.stringify({ ...unsure, parts: [] })]);
    const input = snapshot(true);
    const checker = c.createPublicationContentCheck({ judge: () => judge, clock: () => now, recorder: { async record() {} } });
    expect(await checker.check({ runId, snapshot: input })).toEqual({ outcome: "UNSURE", statement: { outcome: "UNSURE", parts: kinds, ground: "TERMS", automated: true, visibility: "PRIVATE" } });
    expect(judge.packets).toHaveLength(1);
    for (const packet of judge.packets) expect(() => assertFramedPrompt(packet)).not.toThrow();
    const serialized = JSON.stringify(judge.packets);
    for (const id of [runId, "EXCLUDED-", "PRIVATE-USER", "PRIVATE-OWNER", "PRIVATE-EMAIL", "PRIVATE-SESSION", "PRIVATE-IP", "PRIVATE-REQUEST", "PRIVATE-PUBLICATION"]) expect(serialized).not.toContain(id);
    const packet = judge.packets[0]!;
    const envelope = JSON.parse(packet.messages[1]!.content.split("\n").slice(1, -1).join("\n"));
    expect(envelope.fields).toEqual(m.packJudgeCalls(m.extractCheckedText(input))[0]!.fields);
  });
  // Property: bounded parallel workers preserve call-index failure order and stop starting after the shared deadline.
  it("bounds concurrency, shares the deadline, and preserves the first failed call", async () => {
    const c = await import("../../apps/api/src/publication-check/check.js");
    let active = 0, peak = 0, started = 0;
    const signals: AbortSignal[] = [];
    const judge: PublicationJudgePort = { providerRef: "p", modelId: "m", async complete({ signal }) {
      const index = started++; signals.push(signal); active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, index === 0 ? 30 : 5)); active--;
      throw new c.PublicationJudgeFailure(index === 0 ? "JUDGE_HTTP_STATUS" : "JUDGE_TRANSPORT_FAILED");
    } };
    const result = await c.judgeParts({ judge, maxMaterialCodePoints: 1, maxConcurrentCalls: 2 }, [{ kind: "ARGUMENTS", text: "abcdef" }]);
    expect(result.result).toEqual({ outcome: "UNAVAILABLE", cause: "JUDGE_HTTP_STATUS" });
    expect(result.judgeCallCount).toBe(6); expect(peak).toBe(2); expect(new Set(signals).size).toBe(1);
    let hungCalls = 0;
    const hung = await c.judgeParts({ judge: { ...judge, complete() { hungCalls++; return new Promise(() => {}); } }, deadlineMs: 20, maxMaterialCodePoints: 1, maxConcurrentCalls: 2 }, [{ kind: "ARGUMENTS", text: "abcdef" }]);
    expect(hung.result).toEqual({ outcome: "UNAVAILABLE", cause: "JUDGE_DEADLINE" });
    expect(hungCalls).toBe(2); expect(hung.judgeCallCount).toBe(2);
  });
  // Property: a refused record write cannot resolve as ALLOW.
  it("propagates recorder failure", async () => {
    const c = await import("../../apps/api/src/publication-check/check.js");
    const { createJudgeStub } = await import("../support/hs-s02-judge-stub.js");
    const check = c.createPublicationContentCheck({ judge: () => createJudgeStub([JSON.stringify(allow)]), clock: () => now, recorder: { async record() { throw new Error("record unavailable"); } } });
    await expect(check.check({ runId, snapshot: { question: "q" } as PublicDebate })).rejects.toThrow("record unavailable");
  });
});
