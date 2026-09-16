import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Judge } from "@debateai/judgement";
import {
  ProviderContentUnacceptedError,
  type PromptPacket,
  type ProviderCallRequest,
  type ProviderGateway
} from "@debateai/providers";
import {
  EVALUATOR_INSTRUCTIONS,
  SYNTHESIZER_INSTRUCTIONS,
  buildEvaluatorRequest,
  buildSynthesisDigest,
  buildSynthesizerRequest,
  toSynthesisPromptPayload,
  type SynthesisCodeLabel,
  type SynthesisDigest,
  type SynthesisLoopControls
} from "@debateai/serve";

/**
 * W7 / V-BLIND-CONTEXT (2026-09-03) — the model is blind to authorship; the
 * DATABASE is not.
 *
 * V's rule has two halves and both must hold: provenance is RECORDED in full,
 * and WITHHELD from every model. This guard owns the second half for the
 * judgement package's whole prompt surface. It renders EVERY prompt builder
 * with routing/provenance values that cannot occur naturally, and asserts none
 * of them reaches any message content sent to a provider.
 *
 * Why a surface guard rather than a per-site assertion: the `author_maker` leak
 * survived from 2026-09-03 because nothing checked. A per-site test only pins
 * the sites someone remembered. The coverage row below fails when a NEW builder
 * appears in the package and is not listed here, so the next builder cannot be
 * added blind. (Task 12 extends this file to the rest of the surface.)
 *
 * The repair packet is captured as well: it re-sends the original messages
 * (`buildContentRepairPacket`), so a leak in a first packet leaks again on
 * every repair attempt.
 */

const JUDGEMENT_SRC = fileURLToPath(new URL("../../packages/judgement/src", import.meta.url));

/**
 * Every value the CALLER supplies that is routing or provenance — who authored
 * the node, which run, which work item, which call site, which provider
 * identity, which contract. None of it is material the reviewing model needs to
 * answer, so none of it may appear in a message. Each sentinel is distinct so a
 * failure names the field that leaked.
 */
const WITHHELD = {
  authorMaker: "AUTHOR-SENTINEL-7f3a",
  runId: "RUNID-SENTINEL-7f3a",
  subjectItemId: "SUBJECT-SENTINEL-7f3a",
  callSiteKey: "CALLSITE-SENTINEL-7f3a",
  providerRef: "PROVIDERREF-SENTINEL-7f3a",
  contractHash: "CONTRACT-SENTINEL-7f3a"
} as const;

/** The material the model IS entitled to. Present-checks run against these. */
const QUESTION_LINE = "Should the proposal stand?";
const STATEMENT = "The proposal should stand on its own merits.";
const TARGET_STATEMENT = "The proposal fails on cost.";

/** The foreign-text framing V-BLIND-CONTEXT keeps: authored elsewhere, never by whom. */
const FOREIGN_TEXT_FRAMING = "authored by another participant";

const BOUND = { maxAttempts: 1, tokenCeiling: 256, deadlineMs: 5_000 } as const;

interface Capture {
  readonly builder: string;
  readonly stage: "initial" | "repair";
  readonly packet: PromptPacket;
}

function capturingGateway(builder: string, captures: Capture[]): ProviderGateway {
  return {
    call: async (request: ProviderCallRequest) => {
      captures.push({ builder, stage: "initial", packet: request.packet });
      const repair = request.buildRepairPacket?.({
        rawText: "not a JSON object",
        parseStatus: "SCHEMA_FAILED",
        parseError: "prompt-surface guard probe"
      });
      if (repair !== undefined) captures.push({ builder, stage: "repair", packet: repair });
      throw new ProviderContentUnacceptedError(
        1, "SCHEMA_FAILED", "prompt-surface guard probe", "artifact:guard", "ledger:guard"
      );
    }
  };
}

const SUBJECT = {
  runId: WITHHELD.runId,
  subjectItemId: WITHHELD.subjectItemId,
  callSiteKey: WITHHELD.callSiteKey,
  questionLine: QUESTION_LINE,
  statement: STATEMENT,
  authorMaker: WITHHELD.authorMaker,
  providerRef: WITHHELD.providerRef,
  contractHash: WITHHELD.contractHash,
  bound: BOUND
} as const;

/**
 * One row per prompt builder in `packages/judgement/src`. `framing` is the
 * foreign-text sentence that builder must keep (`null` where the builder sends
 * no foreign statement at all). Base commit e6477f64 line numbers, for the
 * record only — the coverage row below counts the sites in the source, so this
 * table cannot silently fall behind the file.
 */
const BUILDERS = [
  {
    name: "Judge.judge",
    framing: null,
    material: [QUESTION_LINE],
    render: async (judge: Judge): Promise<void> => {
      await expect(judge.judge({
        runId: SUBJECT.runId,
        subjectItemId: SUBJECT.subjectItemId,
        callSiteKey: SUBJECT.callSiteKey,
        questionLine: QUESTION_LINE,
        providerRef: SUBJECT.providerRef,
        contractHash: SUBJECT.contractHash,
        bound: BOUND
      })).rejects.toBeDefined();
    }
  },
  {
    name: "Judge.review",
    framing: FOREIGN_TEXT_FRAMING,
    material: [QUESTION_LINE, STATEMENT, TARGET_STATEMENT],
    render: async (judge: Judge): Promise<void> => {
      await expect(judge.review({
        ...SUBJECT,
        edges: [{ edgeId: "edge:guard", targetStatement: TARGET_STATEMENT, polarity: "attack" }]
      })).rejects.toBeDefined();
    }
  },
  {
    name: "Judge.assess",
    framing: FOREIGN_TEXT_FRAMING,
    material: [QUESTION_LINE, STATEMENT],
    render: async (judge: Judge): Promise<void> => {
      await expect(judge.assess({ ...SUBJECT })).rejects.toBeDefined();
    }
  }
] as const;

async function captureAll(): Promise<Capture[]> {
  const captures: Capture[] = [];
  for (const builder of BUILDERS) {
    await builder.render(new Judge(capturingGateway(builder.name, captures)));
  }
  return captures;
}

function contentsOf(captures: readonly Capture[], builder: string): string[] {
  return captures
    .filter((capture) => capture.builder === builder)
    .flatMap((capture) => capture.packet.messages.map((message) => message.content));
}

describe("V-BLIND-CONTEXT — the judgement prompt surface withholds authorship", () => {
  it("covers every prompt builder in packages/judgement/src", async () => {
    // A `role: "system"` site is one prompt builder. If someone adds a fourth,
    // this row fails before any of the withholding rows can report a coverage
    // it never had.
    const systemSites = readdirSync(JUDGEMENT_SRC)
      .filter((entry) => entry.endsWith(".ts"))
      .map((entry) => readFileSync(`${JUDGEMENT_SRC}/${entry}`, "utf8"))
      .join("\n")
      .split(/\brole: "system"/).length - 1;
    expect(systemSites).toBe(BUILDERS.length);

    // And the instrument must actually have run: one initial packet plus one
    // repair packet per builder, every packet carrying messages.
    const captures = await captureAll();
    expect(captures.map(({ builder, stage }) => `${builder}:${stage}`)).toEqual(
      BUILDERS.flatMap(({ name }) => [`${name}:initial`, `${name}:repair`])
    );
    expect(captures.every(({ packet }) => packet.messages.length > 0)).toBe(true);
  });

  it.each(BUILDERS.map(({ name }) => name))(
    "%s sends no withheld routing or provenance value to the model",
    async (builder) => {
      const contents = contentsOf(await captureAll(), builder);
      const leaked = Object.entries(WITHHELD)
        .filter(([, sentinel]) => contents.some((content) => content.includes(sentinel)))
        .map(([field]) => field);
      expect(leaked).toEqual([]);
    }
  );

  it.each(BUILDERS.filter((builder) => builder.framing !== null).map(({ name, framing }) => [name, framing] as const))(
    "%s keeps the foreign-text framing without naming the author",
    async (builder, framing) => {
      const captures = await captureAll();
      const system = captures
        .filter((capture) => capture.builder === builder && capture.stage === "initial")
        .flatMap((capture) => capture.packet.messages.filter((message) => message.role === "system"))
        .map((message) => message.content);
      expect(system).toHaveLength(1);
      expect(system[0]).toContain(framing);
      // V-S11-GRADER: the same model may review, so the prompt may not assert
      // that the reviewer differs from the author.
      expect(system[0]).not.toMatch(/different maker|another maker/);
    }
  );

  it.each(BUILDERS.map(({ name, material }) => [name, material] as const))(
    "%s still carries the material the model needs",
    async (builder, material) => {
      // Known-GOOD input: a guard that passes because the packet is empty
      // would report withholding it never measured.
      const contents = contentsOf(await captureAll(), builder);
      for (const expected of material) {
        expect(contents.some((content) => content.includes(expected))).toBe(true);
      }
    }
  );
});

/* ===================================================================== W9 ==
 * Task 12 extends this file from the JUDGEMENT prompt surface to the SYNTHESIS
 * prompt surface. Same instrument, same failure it exists to catch: a value the
 * caller needs and the model does not, riding to a provider because serialising
 * the whole object was easier than naming what the task depends on.
 * ======================================================================== */

/**
 * W9 / V-MINIMUM-PAYLOAD (2026-09-03) — the model gets its TASK, not the
 * machinery that routes it.
 *
 * V withheld four values from every model-facing synthesis payload:
 *  · `roleRef`      — the routing address. The runner resolves the provider from
 *                     it one line ABOVE the prompt, then serialised it anyway.
 *  · `round`        — `evaluatorLoopMaxRounds` is configured, so "round 3 of 3"
 *                     tells a model this is its last attempt. That changes the
 *                     decision both roles face, and neither task depends on the
 *                     count. This is the one that actively BIASES.
 *  · `stage`        — already redundant: a retry carries `priorObjection`, which
 *                     shows the situation more directly than the flag states it.
 *  · `registerVersion` inside `codeLabel` — settings metadata, useless to a writer.
 *
 * The REQUEST OBJECT keeps every one of them. `assertFreshContextRequest`
 * inspects the request, not the prompt, so the frozen key sets are untouched and
 * the audit record keeps full provenance — V's rule is RECORDED and WITHHELD,
 * never forgotten. That is why this guard renders the PAYLOAD while the T9 suite
 * still pins the RECORD: they are two different objects and both are asserted.
 *
 * `priorCandidateRef` is withheld here as well, and that is this seat's reading
 * rather than a fifth name in the ruling: it is an artifact ADDRESS, the same
 * class as `roleRef`, and the ruling's kept-list ("KEPT, because the tasks
 * depend on them") does not contain it. The heartbeat's finding law says to fix
 * the CLASS and sweep every member, so the projection is a named allow-list and
 * every address falls outside it. Overturning that costs one entry in the row's
 * `projectedKeys` — the pin is exact, so the decision cannot rot silently.
 */

const RUNNER_SRC = fileURLToPath(new URL("../../apps/runner/src/index.ts", import.meta.url));
const SYNTHESIS_SRC = fileURLToPath(new URL("../../packages/serve/src/synthesis.ts", import.meta.url));

/**
 * Two CALL SITES in the runner (`synthesize`, `evaluate`) render three PAYLOAD
 * SHAPES, because the synthesizer site serves both of its stages. The coverage
 * row counts the sites in the source; the table below enumerates the shapes.
 */
const SYNTHESIS_CALL_SITES = 2;

/**
 * Machinery values that cannot occur naturally, so a failure names the field
 * that leaked rather than a plausible-looking number. `stage` cannot carry a
 * sentinel — it is the literal union `"INITIAL" | "RETRY"` — so it is pinned by
 * KEY NAME and by both of its values.
 */
const MACHINERY = {
  synthesizerRoleRef: "SYNTH-ROLEREF-SENTINEL-4c1d",
  evaluatorRoleRef: "EVAL-ROLEREF-SENTINEL-4c1d",
  round: 424_242,
  registerVersion: 515_151,
  priorCandidateRef: "PRIOR-CANDREF-SENTINEL-4c1d"
} as const;

/** Key names that may not appear anywhere in a model-facing synthesis payload. */
const WITHHELD_SYNTHESIS_KEYS = ["roleRef", "round", "stage", "registerVersion", "priorCandidateRef"] as const;

/** The material each task depends on. Present-checks run against these. */
const DIGEST_NODE_TEXT = "The measured p95 regression is twelve percent on the RAN path.";
const CANDIDATE_STATEMENT = "The proposal holds, with the cost objection unresolved.";
const PRIOR_OBJECTION = "Round 1 overstates the RAN evidence: node position:a is inconclusive.";
const VERDICT_LABEL = "CONTESTED";
const SERVED_NODE_ID = "position:a";
const SERVED_STRENGTH = 0.7321;
const MARGIN = 0.1234;

/**
 * Tokens four provider doubles classify requests by
 * (`tests/integration/t17-envelope-ledger.test.ts:199-210`,
 * `tests/integration/database.test.ts:472-494`, `acceptance/ceremony.test.ts:72-94`,
 * `acceptance/panel-multi-maker.test.ts:129-172`). TOOLING-TRAPS `:5015`: a
 * prompt sentence IS a dispatch key, and a payload that grows a foreign organ's
 * token re-routes the call silently — the double answers with the wrong organ's
 * artifact and the suite reports a schema error about something else entirely.
 * Each row below lists the tokens of organs that are NOT its own.
 */
const FOREIGN_ORGAN_TOKENS = ["edge_bearings", "restatement_text", "fatalFlags", "conforms,findings", "{pass}"] as const;

const SYNTHESIS_CONTROLS: SynthesisLoopControls = {
  synthesizerRoleRef: MACHINERY.synthesizerRoleRef,
  evaluatorRoleRef: MACHINERY.evaluatorRoleRef,
  evaluatorLoopMaxRounds: 3
};

const SYNTHESIS_CODE_LABEL: SynthesisCodeLabel = {
  verdictLabel: VERDICT_LABEL,
  servedNodeId: SERVED_NODE_ID,
  servedStrength: SERVED_STRENGTH,
  margin: MARGIN,
  registerVersion: MACHINERY.registerVersion
};

/** Built by the SHIPPED digest builder, so the fixture cannot drift from the type. */
function guardDigest(): SynthesisDigest {
  const outcome = buildSynthesisDigest({
    nodes: [{
      nodeId: SERVED_NODE_ID,
      statement: DIGEST_NODE_TEXT,
      finalStrength: SERVED_STRENGTH,
      wayOfKnowing: "RAN",
      marks: [],
      polarityRelations: [],
      isPosition: true,
      isSurvivingObjection: false
    }],
    servedRootNodeId: SERVED_NODE_ID,
    budgetBound: 8_192
  });
  if (outcome.kind !== "DIGEST") throw new Error("the guard's digest fixture must exist");
  return outcome.digest;
}

/**
 * One row per model-facing synthesis payload shape. `projectedKeys` is the EXACT
 * top-level key set the projection may emit — the assertion that makes a
 * re-added machinery key loud even if nobody remembers to name it in
 * `WITHHELD_SYNTHESIS_KEYS`. It is the payload mirror of the T9 suite's
 * recorded-request key pin (`tests/unit/t09-synthesis.test.ts:336-339`), which
 * stays intact because that one is about the RECORD.
 */
const SYNTHESIS_PAYLOADS = [
  {
    name: "SYNTHESIZER:INITIAL",
    projectedKeys: ["codeLabel", "digest", "instructions", "role"],
    material: [SYNTHESIZER_INSTRUCTIONS, DIGEST_NODE_TEXT, VERDICT_LABEL, String(SERVED_STRENGTH), String(MARGIN)],
    foreignOrganTokens: FOREIGN_ORGAN_TOKENS,
    render: (): string => toSynthesisPromptPayload(buildSynthesizerRequest({
      controls: SYNTHESIS_CONTROLS,
      round: MACHINERY.round,
      digest: guardDigest(),
      codeLabel: SYNTHESIS_CODE_LABEL,
      prior: null
    }))
  },
  {
    name: "SYNTHESIZER:RETRY",
    projectedKeys: ["codeLabel", "digest", "instructions", "priorObjection", "role"],
    // D71 boundary: `priorObjection` is ADMITTED (without it a rewrite is blind
    // and can only repeat itself); `round` is REJECTED from the same payload.
    material: [SYNTHESIZER_INSTRUCTIONS, DIGEST_NODE_TEXT, VERDICT_LABEL, PRIOR_OBJECTION],
    foreignOrganTokens: FOREIGN_ORGAN_TOKENS,
    render: (): string => toSynthesisPromptPayload(buildSynthesizerRequest({
      controls: SYNTHESIS_CONTROLS,
      round: MACHINERY.round,
      digest: guardDigest(),
      codeLabel: SYNTHESIS_CODE_LABEL,
      prior: { objection: PRIOR_OBJECTION, candidateRef: MACHINERY.priorCandidateRef }
    }))
  },
  {
    name: "EVALUATOR",
    projectedKeys: ["candidateStatement", "codeLabel", "digest", "instructions", "role"],
    material: [EVALUATOR_INSTRUCTIONS, DIGEST_NODE_TEXT, VERDICT_LABEL, CANDIDATE_STATEMENT],
    foreignOrganTokens: FOREIGN_ORGAN_TOKENS,
    render: (): string => toSynthesisPromptPayload(buildEvaluatorRequest({
      controls: SYNTHESIS_CONTROLS,
      round: MACHINERY.round,
      digest: guardDigest(),
      codeLabel: SYNTHESIS_CODE_LABEL,
      candidateStatement: CANDIDATE_STATEMENT
    }))
  }
] as const;

/** Every key name in a parsed payload, at every depth, arrays included. */
function everyKeyIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(everyKeyIn);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => [key, ...everyKeyIn(child)]);
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function payloadRow(name: string): (typeof SYNTHESIS_PAYLOADS)[number] {
  const row = SYNTHESIS_PAYLOADS.find((payload) => payload.name === name);
  if (row === undefined) throw new Error(`no synthesis payload row named ${name}`);
  return row;
}

describe("V-MINIMUM-PAYLOAD — the synthesis prompt surface withholds the machinery", () => {
  it("routes every model-facing synthesis payload through the one projection", () => {
    const runner = readFileSync(RUNNER_SRC, "utf8");
    // The defect this ticket repairs, stated as a source fact: no synthesis site
    // may serialise the request whole. A third call site added later is caught
    // by the same two counts, in either direction.
    expect(occurrences(runner, "JSON.stringify(request)")).toBe(0);
    expect(occurrences(runner, "toSynthesisPromptPayload(request)")).toBe(SYNTHESIS_CALL_SITES);
    // ...and there is exactly ONE projection, so the allow-list cannot be forked
    // into a second copy that quietly readmits a field.
    expect(occurrences(readFileSync(SYNTHESIS_SRC, "utf8"), "export function toSynthesisPromptPayload")).toBe(1);
  });

  it.each(SYNTHESIS_PAYLOADS.map(({ name }) => name))(
    "%s sends no routing, ordinal or settings machinery to the model",
    (name) => {
      const raw = payloadRow(name).render();

      // By KEY, at every depth — this is what catches `codeLabel.registerVersion`.
      const leakedKeys = everyKeyIn(JSON.parse(raw) as unknown)
        .filter((key) => (WITHHELD_SYNTHESIS_KEYS as readonly string[]).includes(key));
      expect(leakedKeys).toEqual([]);

      // By VALUE, over the raw bytes — this catches a machinery value smuggled
      // into prose, where no key name would betray it.
      const leakedValues = Object.entries(MACHINERY)
        .filter(([, sentinel]) => raw.includes(String(sentinel)))
        .map(([field]) => field);
      expect(leakedValues).toEqual([]);

      // `stage` has no sentinel: both of its values are pinned directly.
      expect(raw).not.toContain("INITIAL");
      expect(raw).not.toContain("RETRY");
    }
  );

  it.each(SYNTHESIS_PAYLOADS.map(({ name, projectedKeys }) => [name, projectedKeys] as const))(
    "%s emits EXACTLY its projected key set",
    (name, projectedKeys) => {
      const parsed = JSON.parse(payloadRow(name).render()) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual([...projectedKeys]);
      // The code label's REAL NUMBERS, and only those: the ruling keeps the
      // label, the node, the strength and the margin, and drops the version.
      expect(Object.keys(parsed["codeLabel"] as Record<string, unknown>).sort())
        .toEqual(["margin", "servedNodeId", "servedStrength", "verdictLabel"]);
    }
  );

  it.each(SYNTHESIS_PAYLOADS.map(({ name, material }) => [name, material] as const))(
    "%s still carries the material its task depends on",
    (name, material) => {
      // Known-GOOD input (TOOLING-TRAPS `:214`): a projection that returned
      // `"{}"` would satisfy every withholding row above while withholding the
      // task as well. These rows are what make the absence above MEASURED.
      const raw = payloadRow(name).render();
      for (const expected of material) expect(raw).toContain(expected);
    }
  );

  it.each(SYNTHESIS_PAYLOADS.map(({ name, foreignOrganTokens }) => [name, foreignOrganTokens] as const))(
    "%s carries no other organ's dispatch token",
    (name, foreignOrganTokens) => {
      const raw = payloadRow(name).render();
      expect(foreignOrganTokens.filter((token) => raw.includes(token))).toEqual([]);
    }
  );

  it("states the code-label obligation to the party judged on it (F-W9-1)", () => {
    // The evaluator is instructed to check "agreement between the statement and
    // the code label" and overstatement. Before this ticket the SYNTHESIZER
    // received `codeLabel` and was never told what to do with it — a rule
    // enforced against a party that was never told it was bound by it. The
    // property is that the obligation is STATED, so these assertions are about
    // the two duties, never about a sentence someone may legitimately reword.
    expect(SYNTHESIZER_INSTRUCTIONS).toMatch(/agree\w*\b[^.]*\bcode label|code label[^.]*\bagree/iu);
    expect(SYNTHESIZER_INSTRUCTIONS).toMatch(/confidence/iu);
    // ...and the duties the evaluator already grades stay stated as well.
    expect(SYNTHESIZER_INSTRUCTIONS).toMatch(/digest node/iu);
    expect(SYNTHESIZER_INSTRUCTIONS).toMatch(/losing positions/iu);
  });
});
