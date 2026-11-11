// V4 start step, Task 79c (owner answer Q33 A, 5 Nov 2026): "Your maps" shows a dig made on someone else's public page as a card of its
// own, "Dig: {its pick}" (dig-f30's words), the one case of a dig card of its own. GET /v1/answers says it on each row: `dug_on_public`,
// and for such a dig its first pick's words (`dig_pick`). The page part is the review session's; this is the data it reads. Over
// stand-ins for 0137's own-contributions read, the owner-gated run read and 0135's pick reader; made-up texts only.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  AnswerIndexSchema, AnswerSummarySchema, OpenRunSummarySchema, WEB_CONTRACT_LIMITS, contractInventory, type AnswerIndex
} from "@debateai/contract";
import type { PublicContributionRead } from "@debateai/db";
import { publicDigRowPart } from "../../tools/v4-mock-api/public-seed.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const PERSON = testHttpIdentity("answers-public-dig-person");
/** An ordinary question of the person's. */
const QUESTION = "11111111-1111-4111-8111-111111111111";
/** The person's own debate, public, and their dig of it (a contribution to its public tree, as every dig on a public debate is). */
const OWN_PUBLIC = "22222222-2222-4222-8222-222222222222";
const OWN_DIG = "33333333-3333-4333-8333-333333333333";
/** Digs on someone else's public page: one answered, one still running under it, one whose pick cannot be read. */
const PUBLIC_DIG = "44444444-4444-4444-8444-444444444444";
const PUBLIC_DIG_RUNNING = "55555555-5555-4555-8555-555555555555";
const NO_PICK_DIG = "66666666-6666-4666-8666-666666666666";
/** The stranger's debate behind that page, and the page. */
const STRANGER_ROOT = "77777777-7777-4777-8777-777777777777";
const PUBLICATION = "88888888-8888-4888-8888-888888888888";

const PICK = "Is storage cheap enough for a two-week winter lull?";
const RUNNING_PICK = "Small towns behave differently.";

const answerRow = (runRef: string, seq: number, question: string) => ({
  answer_id: `aaaa${runRef.slice(4)}`, run_ref: runRef, answer_version: 1, question_line: question, verdict_state: null, abstention: null,
  serve_state: "COMPOSED" as const, staleness_state: "FRESH" as const, builds_on_previous: false, created_at_sequence: seq
});
const INDEX: AnswerIndex = AnswerIndexSchema.parse({
  items: [
    answerRow(NO_PICK_DIG, 9, "Look deeper into this part of the answer: free fares for everyone."),
    answerRow(PUBLIC_DIG, 8, "Look deeper into this part of the answer: mostly renewables."),
    answerRow(OWN_DIG, 7, "Look deeper into this part of the answer: keep the old reactors."),
    answerRow(OWN_PUBLIC, 6, "Should my country keep its old nuclear reactors running?"),
    answerRow(QUESTION, 5, "Should my town close the old centre to cars at weekends?")
  ],
  open_runs: [{ run_ref: PUBLIC_DIG_RUNNING, question_line: "Look deeper into this part of the answer: small towns.", state: "RUNNING",
    terminal_reason: null, created_at_sequence: 10 }],
  limit: 20, offset: 0, total: 6
});

const contribution = (digRunId: string, rootRunId: string, parentRunId: string): PublicContributionRead => ({
  dig_run_id: digRunId, publication_ref: PUBLICATION, root_run_id: rootRunId, parent_run_id: parentRunId, position_ref: "path:b1",
  contributed_at: "2026-11-05T09:00:00.000Z", outcome: null, checked_at: null, contributor: "quiet-heron"
});
/** The person's contributions, as 0137 keeps them. */
const CONTRIBUTIONS: readonly PublicContributionRead[] = [
  contribution(OWN_DIG, OWN_PUBLIC, OWN_PUBLIC),
  contribution(PUBLIC_DIG, STRANGER_ROOT, STRANGER_ROOT),
  contribution(PUBLIC_DIG_RUNNING, STRANGER_ROOT, PUBLIC_DIG),
  contribution(NO_PICK_DIG, STRANGER_ROOT, STRANGER_ROOT)
];
/** The person's own runs: the owner-gated run read finds these, and nothing of the stranger's. */
const OWN_RUNS = new Set([QUESTION, OWN_PUBLIC, OWN_DIG, PUBLIC_DIG, PUBLIC_DIG_RUNNING, NO_PICK_DIG]);

type Faults = Partial<Readonly<{ readOwn: string; readRun: string; pick: string }>>;
type Seen = { readOwn: string[]; readRun: string[]; picks: string[] };

function apiOver(input: Readonly<{ publicTree?: boolean; faults?: Faults; picks?: Readonly<Record<string, string | null>> }> = {}) {
  const seen: Seen = { readOwn: [], readRun: [], picks: [] };
  const faults = input.faults ?? {};
  const picks = input.picks ?? { [PUBLIC_DIG]: PICK, [PUBLIC_DIG_RUNNING]: RUNNING_PICK, [NO_PICK_DIG]: null };
  const application = {
    readAnswerIndex: async () => INDEX,
    readRun: async (runId: string) => {
      seen.readRun.push(runId);
      if (faults.readRun === runId) throw new Error("run read failed");
      return OWN_RUNS.has(runId) ? { run_ref: runId, question_line: "q", state: "SETTLED", terminal_reason: null, hold_until: null } : null;
    }
  } as unknown as AskApplication;
  const api = buildApi({
    application,
    sessions: testSessionApplication([PERSON]),
    allowedOrigin: TEST_APP_ORIGIN,
    ...(input.publicTree === false ? {} : {
      publicTree: {
        pool: {} as never,
        tree: {} as never,
        // 0137's read_own_public_contributions: the person's own, where the run is the dig, its parent or its root.
        contributions: { readOwn: async (ownerRef: string, runId: string) => {
          seen.readOwn.push(runId);
          if (faults.readOwn === runId) throw new Error("contributions read failed");
          return ownerRef !== PERSON.authenticated.ownerRef ? [] : CONTRIBUTIONS.filter((entry) =>
            entry.dig_run_id === runId || entry.parent_run_id === runId || entry.root_run_id === runId);
        } } as never,
        readPublicDebate: async () => null
      },
      // 0135's reader: the dig's first pick, opened under its own run key.
      publicDigPick: async (digRunId: string) => {
        seen.picks.push(digRunId);
        if (faults.pick === digRunId) throw new Error("pick read failed");
        return picks[digRunId] ?? null;
      }
    })
  });
  return { api, seen };
}

async function readIndex(api: ReturnType<typeof apiOver>["api"]) {
  const response = await api.inject({ method: "GET", url: "/v1/answers?limit=20&offset=0", headers: testSessionHeaders(PERSON) });
  expect(response.statusCode).toBe(200);
  return response.json() as AnswerIndex & { items: Record<string, unknown>[]; open_runs: Record<string, unknown>[] };
}
const rowOf = (index: { items: Record<string, unknown>[]; open_runs: Record<string, unknown>[] }, runRef: string) =>
  [...index.items, ...index.open_runs].find((row) => row.run_ref === runRef)!;

describe("GET /v1/answers marks a dig made on someone else's public page, with its pick (Q33 A)", () => {
  it("a dig on a public page is true with its first pick's words; a dig of the person's own debate and an ordinary question are false", async () => {
    const { api, seen } = apiOver();
    const index = await readIndex(api);
    expect(rowOf(index, PUBLIC_DIG)).toMatchObject({ dug_on_public: true, dig_pick: PICK });
    // Still running: the open row says it too.
    expect(rowOf(index, PUBLIC_DIG_RUNNING)).toMatchObject({ dug_on_public: true, dig_pick: RUNNING_PICK });
    // A dig of the person's own public debate is a contribution too, but it sits under its own question.
    expect(rowOf(index, OWN_DIG).dug_on_public).toBe(false);
    // Its debate's read lists that contribution (its root): only the row's own contribution counts.
    expect(rowOf(index, OWN_PUBLIC).dug_on_public).toBe(false);
    expect(rowOf(index, QUESTION).dug_on_public).toBe(false);
    for (const runRef of [OWN_DIG, OWN_PUBLIC, QUESTION]) expect(Object.hasOwn(rowOf(index, runRef), "dig_pick"), runRef).toBe(false);
    // A dig on a public page whose pick cannot be read (none kept, or its key gone) is marked without one.
    expect(rowOf(index, NO_PICK_DIG).dug_on_public).toBe(true);
    expect(Object.hasOwn(rowOf(index, NO_PICK_DIG), "dig_pick")).toBe(false);
    // The two members come last, as the contract names them.
    expect(Object.keys(rowOf(index, PUBLIC_DIG)).slice(-2)).toEqual(["dug_on_public", "dig_pick"]);
    expect(Object.keys(rowOf(index, PUBLIC_DIG_RUNNING)).slice(-2)).toEqual(["dug_on_public", "dig_pick"]);
    expect(Object.keys(rowOf(index, QUESTION)).at(-1)).toBe("dug_on_public");
    // Each debate behind a contribution is asked about once; a pick is read only for a dig on someone else's page.
    expect([...seen.readRun].sort()).toEqual([OWN_PUBLIC, STRANGER_ROOT]);
    expect([...seen.picks].sort()).toEqual([PUBLIC_DIG, PUBLIC_DIG_RUNNING, NO_PICK_DIG].sort());
    expect(AnswerIndexSchema.safeParse(index).success).toBe(true);
    await api.close();
  });

  it("without the public tree the rows are today's, byte for byte", async () => {
    const { api } = apiOver({ publicTree: false });
    const response = await api.inject({ method: "GET", url: "/v1/answers?limit=20&offset=0", headers: testSessionHeaders(PERSON) });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(JSON.stringify(INDEX));
    await api.close();
  });

  it("a read that fails leaves its row unmarked; a pick that fails or does not fit leaves the mark without the words", async () => {
    const failing = apiOver({ faults: { readOwn: PUBLIC_DIG, readRun: STRANGER_ROOT } });
    const index = await readIndex(failing.api);
    for (const runRef of [PUBLIC_DIG, PUBLIC_DIG_RUNNING, NO_PICK_DIG]) {
      expect(rowOf(index, runRef).dug_on_public, runRef).toBe(false);
      expect(Object.hasOwn(rowOf(index, runRef), "dig_pick"), runRef).toBe(false);
    }
    await failing.api.close();
    const blank = apiOver({ faults: { pick: PUBLIC_DIG }, picks: { [PUBLIC_DIG_RUNNING]: "  ", [NO_PICK_DIG]: "x".repeat(WEB_CONTRACT_LIMITS.pickTextMaxChars + 1) } });
    const marked = await readIndex(blank.api);
    for (const runRef of [PUBLIC_DIG, PUBLIC_DIG_RUNNING, NO_PICK_DIG]) {
      expect(rowOf(marked, runRef).dug_on_public, runRef).toBe(true);
      expect(Object.hasOwn(rowOf(marked, runRef), "dig_pick"), runRef).toBe(false);
    }
    await blank.api.close();
  });
});

describe("the contract's rows name the two members (Task 79c)", () => {
  const ITEM = answerRow(QUESTION, 5, "Should my town close the old centre to cars at weekends?");
  const OPEN = { run_ref: PUBLIC_DIG_RUNNING, question_line: "Look deeper.", state: "RUNNING", terminal_reason: null, created_at_sequence: 10 };

  it("both row shapes end with them, optional: an old row parses unchanged", () => {
    for (const schema of [AnswerSummarySchema, OpenRunSummarySchema]) {
      expect(Object.keys(schema.shape).slice(-2)).toEqual(["dug_on_public", "dig_pick"]);
      const json = z.toJSONSchema(schema, { unrepresentable: "any" }) as { required: string[] };
      expect(json.required).not.toContain("dug_on_public");
      expect(json.required).not.toContain("dig_pick");
    }
    expect(AnswerSummarySchema.parse(ITEM)).toEqual(ITEM);
    expect(OpenRunSummarySchema.parse(OPEN)).toEqual(OPEN);
    expect(AnswerSummarySchema.parse({ ...ITEM, dug_on_public: false })).toEqual({ ...ITEM, dug_on_public: false });
    expect(OpenRunSummarySchema.parse({ ...OPEN, dug_on_public: true, dig_pick: PICK })).toEqual({ ...OPEN, dug_on_public: true, dig_pick: PICK });
  });

  it("a pick only on a row marked true, as words that fit a pick", () => {
    for (const [schema, row] of [[AnswerSummarySchema, ITEM], [OpenRunSummarySchema, OPEN]] as const) {
      expect(schema.safeParse({ ...row, dug_on_public: true, dig_pick: PICK }).success).toBe(true);
      expect(schema.safeParse({ ...row, dug_on_public: true }).success).toBe(true);
      expect(schema.safeParse({ ...row, dig_pick: PICK }).success).toBe(false);
      expect(schema.safeParse({ ...row, dug_on_public: false, dig_pick: PICK }).success).toBe(false);
      expect(schema.safeParse({ ...row, dug_on_public: true, dig_pick: " " }).success).toBe(false);
      expect(schema.safeParse({ ...row, dug_on_public: true, dig_pick: "x".repeat(WEB_CONTRACT_LIMITS.pickTextMaxChars + 1) }).success).toBe(false);
      expect(schema.safeParse({ ...row, dug_on_public: "yes" }).success).toBe(false);
    }
  });

  it("the inventory keeps the same shapes, whose field lists (as generate.ts writes them) end with the two; no route is added", () => {
    const resources = contractInventory.resources as unknown as Record<string, unknown>;
    expect(resources.AnswerSummarySchema).toBe(AnswerSummarySchema);
    expect(resources.OpenRunSummarySchema).toBe(OpenRunSummarySchema);
    expect(resources.AnswerIndexSchema).toBe(AnswerIndexSchema);
    for (const name of ["AnswerSummarySchema", "OpenRunSummarySchema"]) {
      const schema = resources[name] as z.ZodObject;
      expect(Object.keys(schema.shape).slice(-2), name).toEqual(["dug_on_public", "dig_pick"]);
    }
    expect(contractInventory.routes.filter((route) => route.startsWith("GET /v1/answers"))).toContain("GET /v1/answers");
  });
});

describe("the mock API serves both (Task 79c)", () => {
  it("a dig on someone else's public page says true with its pick, or true alone without one; every other row says false", () => {
    expect(publicDigRowPart(undefined)).toEqual({ dug_on_public: false });
    expect(publicDigRowPart({ pick: RUNNING_PICK })).toEqual({ dug_on_public: true, dig_pick: RUNNING_PICK });
    expect(publicDigRowPart({ pick: null })).toEqual({ dug_on_public: true });
    const item = answerRow(QUESTION, 5, "Should my town close the old centre to cars at weekends?");
    for (const part of [publicDigRowPart(undefined), publicDigRowPart({ pick: PICK }), publicDigRowPart({ pick: null })]) {
      expect(AnswerSummarySchema.safeParse({ ...item, ...part }).success).toBe(true);
    }
  });

  it("the answer list adds it to served and open rows; the seeded digs on a public page and a new public dig carry their pick", () => {
    const server = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/server.ts"), "utf8");
    const shelf = server.slice(server.indexOf("function shelfPart("), server.indexOf("function answerIndex("));
    expect(shelf.match(/publicDigRowPart\(run\.publicDig\)/gu)).toHaveLength(2);
    // The seeded digs on the public debate (each in one state of its check), with the pick their answer carries.
    expect(server).toContain("run.publicDig = Object.freeze({ pick: SEEDED_CONTRIBUTION_PICK });");
    expect(server).toContain('picks: [{ kind: "OWN_VIEW", place: "path:n-mix", text: SEEDED_CONTRIBUTION_PICK, by: "PERSON_OWN_VIEW" }]');
    // A dig the page sends with `public_parent`: its first pick, or none; waiting or running alike.
    expect(server).toContain("const publicDig = publicParent === undefined ? undefined : Object.freeze({ pick: publicParent.picks?.[0]?.text ?? null });");
    expect(server).toContain("const run = addRun({ runRef, question, seq, waiting: true, ...(publicDig === undefined ? {} : { publicDig }) });");
    expect(server).toContain("if (publicDig !== undefined) run.publicDig = publicDig;");
  });
});
