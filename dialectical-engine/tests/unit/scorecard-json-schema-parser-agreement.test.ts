import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  MOMENT_JSON_SCHEMA,
  MomentFileSchema,
  REPLAY_RESULT_JSON_SCHEMA,
  ReplayResultSchema,
  momentIdFor,
  type PublishedJsonSchema
} from "@debateai/scorecard";

/**
 * The published JSON Schema accepts exactly what the parser accepts (2026-10-25, zod 4.6).
 *
 * The files under packages/scorecard/schema/ are rendered from the zod parsers, and
 * scorecard-json-schema.test.ts proves the files match the renderer. That alone does not prove
 * a reader who validates with the published file gets the parser's verdict: zod 4.6 changed
 * both sides at once (its date-time parser now refuses a time without seconds, its rendered
 * pattern now requires them; a nullable member is now written `type: [..., null]` instead of
 * `anyOf`). Here a real draft 2020-12 validator (ajv) reads the PUBLISHED schema, and on each
 * edge case its verdict must equal the parser's, and the parser's must be the one written here,
 * so a drift on either side, or both, fails by name.
 *
 * Formats are not validated (`validateFormats: false`): the `pattern` zod writes beside
 * `format: "date-time"` must carry the strictness on its own, as it does for a reader whose
 * validator ignores formats.
 */
const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });

function publishedAccepts(schema: PublishedJsonSchema, value: unknown): boolean {
  return ajv.compile(schema as Record<string, unknown>)(value) === true;
}

type Mutate = (document: Record<string, unknown>) => void;
type EdgeCase = readonly [name: string, mutate: Mutate, accepted: boolean];

function withMember(path: readonly string[], value: unknown): Mutate {
  return (document) => {
    let node = document;
    for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>;
    node[path.at(-1)!] = value;
  };
}

function withoutMember(path: readonly string[]): Mutate {
  return (document) => {
    let node = document;
    for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>;
    delete node[path.at(-1)!];
  };
}

/** The date-time edge cases for one member: seconds are required, a fraction of any length is allowed, only Z. */
function dateTimeCases(path: readonly string[]): readonly EdgeCase[] {
  return [
    ["whole seconds", withMember(path, "2026-09-26T12:00:01Z"), true],
    ["milliseconds", withMember(path, "2026-09-26T12:00:01.123Z"), true],
    ["microseconds (a longer fraction)", withMember(path, "2026-09-26T12:00:01.123456Z"), true],
    ["no seconds", withMember(path, "2026-09-26T12:00Z"), false],
    ["a fraction with no seconds", withMember(path, "2026-09-26T12:00.5Z"), false],
    ["an empty fraction", withMember(path, "2026-09-26T12:00:01.Z"), false],
    ["second 60", withMember(path, "2026-09-26T12:00:60Z"), false],
    ["an offset instead of Z", withMember(path, "2026-09-26T12:00:01+02:00"), false],
    ["no zone", withMember(path, "2026-09-26T12:00:01"), false],
    ["29 February of a leap year", withMember(path, "2028-02-29T12:00:01Z"), true],
    ["29 February of a common year", withMember(path, "2026-02-29T12:00:01Z"), false],
    ["null", withMember(path, null), false],
    ["missing", withoutMember(path), false]
  ].map(([name, mutate, accepted]) => [`${path.join(".")}: ${name as string}`, mutate as Mutate, accepted as boolean]);
}

function expectAgreement(parser: z.ZodType, published: PublishedJsonSchema, base: () => Record<string, unknown>, cases: readonly EdgeCase[]): void {
  for (const [name, mutate, accepted] of cases) {
    const document = base();
    mutate(document);
    expect({ name, parser: parser.safeParse(document).success }).toEqual({ name, parser: accepted });
    expect({ name, published: publishedAccepts(published, document) }).toEqual({ name, published: accepted });
  }
}

const builder = { family: "JUDGE_ASSESS" as const, inputs: { questionLine: "Is the claim true?", statement: "It is." } };
const contractHash = "a".repeat(64);
const momentId = momentIdFor({ role: "JUDGE", contractHash, builder });

const moment = (): Record<string, unknown> => ({
  kind: "DEBATEAI_MOMENT",
  formatVersion: 1,
  momentId,
  role: "JUDGE",
  language: "en",
  contractHash,
  builder: structuredClone(builder),
  graderContext: { question: "Is the claim true?", excerpts: [{ label: "statement", text: "It is." }] },
  recorded: {
    providerRef: "provider:openai", maker: "OpenAI", modelId: "model-openai", thinkingLevel: "high", replyText: "{}", promptFingerprint: "c".repeat(64)
  },
  source: { runId: "11111111-1111-4111-8111-111111111111", callSiteKey: "PANEL:root:provider:openai", exportedAt: "2026-09-26T12:00:00.000Z", engineCommit: "0123abc" }
});

const replay = (): Record<string, unknown> => ({
  kind: "DEBATEAI_REPLAY_RESULT",
  formatVersion: 1,
  momentId,
  candidate: { providerRef: "provider:anthropic", maker: "Anthropic", modelId: "model-anthropic", thinkingLevel: "medium" },
  outcome: "OK",
  replyText: "{}",
  parsed: {},
  usage: { reportedInputTokens: 14_000, outputTokens: 120, thinkingTokens: 40 },
  promptTokensEstimate: 900,
  seconds: 4.2,
  promptFingerprint: "b".repeat(64),
  fingerprintMatchesRecorded: true,
  contractHashMatches: true,
  startedAt: "2026-09-26T12:00:01.000Z"
});

/** Each nullable member: null and a value of its own type are accepted, missing and a value of another type are refused. */
function nullableCases(path: readonly string[], ownValue: unknown, otherValue: unknown): readonly EdgeCase[] {
  const at = path.join(".");
  return [
    [`${at}: null`, withMember(path, null), true],
    [`${at}: a value of its type`, withMember(path, ownValue), true],
    [`${at}: a value of another type`, withMember(path, otherValue), false],
    [`${at}: missing`, withoutMember(path), false]
  ];
}

describe("the published scorecard JSON Schemas accept exactly what the parsers accept", () => {
  it("the unchanged documents are accepted by both", () => {
    expect(MomentFileSchema.safeParse(moment()).success).toBe(true);
    expect(publishedAccepts(MOMENT_JSON_SCHEMA, moment())).toBe(true);
    expect(ReplayResultSchema.safeParse(replay()).success).toBe(true);
    expect(publishedAccepts(REPLAY_RESULT_JSON_SCHEMA, replay())).toBe(true);
  });

  it("moment.schema.json: the export time and the nullable members", () => {
    expectAgreement(MomentFileSchema, MOMENT_JSON_SCHEMA, moment, [
      ...dateTimeCases(["source", "exportedAt"]),
      ...nullableCases(["language"], "ro", 1),
      ...nullableCases(["recorded"], moment().recorded, "a reply"),
      ...nullableCases(["recorded", "thinkingLevel"], "low", 2),
      ...nullableCases(["recorded", "promptFingerprint"], "d".repeat(64), false),
      ...nullableCases(["source", "engineCommit"], "fedcba9", 7)
    ]);
  });

  it("replay-result.schema.json: the start time and the nullable members", () => {
    expectAgreement(ReplayResultSchema, REPLAY_RESULT_JSON_SCHEMA, replay, [
      ...dateTimeCases(["startedAt"]),
      ...nullableCases(["replyText"], "a reply", 0),
      ...nullableCases(["fingerprintMatchesRecorded"], false, "yes"),
      ...nullableCases(["usage", "reportedInputTokens"], 0, "14000"),
      ...nullableCases(["usage", "outputTokens"], 1, true),
      ...nullableCases(["usage", "thinkingTokens"], 2, [])
    ]);
  });

  it("an unknown member is refused by both (the moment and replay-result files are closed)", () => {
    expectAgreement(ReplayResultSchema, REPLAY_RESULT_JSON_SCHEMA, replay, [["an extra member", withMember(["note"], "x"), false]]);
    expectAgreement(MomentFileSchema, MOMENT_JSON_SCHEMA, moment, [["an extra member", withMember(["note"], "x"), false]]);
  });
});
