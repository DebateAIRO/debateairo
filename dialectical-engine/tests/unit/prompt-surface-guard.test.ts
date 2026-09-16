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
