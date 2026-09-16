// REV-S03-p3r-product-truth — the CLASS sweep behind the step-7 finding (heartbeat law 3.2:
// a reported finding is a SAMPLE of a class; name the class and sweep every member).
//
// CLASS: "a SHAPE fault in config/models.yaml that SPEC-v3 §2 step 7 requires dev:auth:up to
// refuse with a message naming the tier, the entry's model id and the failure class."
// MEMBERS: the four faults step 7 itself lists.
//
// After V-49 the generator is stage 1 (dev-auth-stack.ts:155-157), ahead of the model check whose
// handler prints the curated line (:312-314). The generator runs via execFileAsync, and the CLI
// prints only developmentAuthStackErrorCode(error) (dev-auth-stack-cli.ts:52-55), which keeps only
// messages matching /^DEV_[A-Z0-9_]+$/ — so an ExecFileException contributes nothing.
//
// For each member this records BOTH: the line the CLI prints today, and the curated line stage 2
// would have printed on the same file. Each member mutates and restores in a finally block; the
// suite re-asserts the committed bytes at the end.

import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createDevelopmentAuthStackOperations,
  developmentAuthStackErrorCode,
  DevelopmentAuthStackError
} from "../../apps/runner/src/dev-auth-stack.js";

const ROOT = process.cwd();
const MODELS = `${ROOT}/config/models.yaml`;
const COMMITTED = readFileSync(MODELS, "utf8");

const COMMAND_ENVIRONMENT = Object.freeze({
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? ""
});

function operations() {
  return createDevelopmentAuthStackOperations(ROOT, COMMAND_ENVIRONMENT);
}

type Member = Readonly<{ name: string; apply: (source: string) => string }>;

const MEMBERS: readonly Member[] = Object.freeze([
  {
    name: "an unknown transport word (api: acme)",
    apply: (s) => s.replace("  - api: openai\n", "  - api: acme\n")
  },
  {
    name: "a fourth key on an entry (cli entry gains `region:`)",
    apply: (s) => s.replace("  - cli: codex\n    model: gpt-5.6-sol\n",
      "  - cli: codex\n    model: gpt-5.6-sol\n    region: eu\n")
  },
  {
    name: "a second Anthropic entry in Premium",
    apply: (s) => s.replace("  - cli: claude\n    model: claude-opus-5\n",
      "  - cli: claude\n    model: claude-opus-5\n  - cli: claude\n    model: claude-sonnet-5\n")
  },
  {
    name: "a key: value that is an actual key-looking string",
    apply: (s) => s.replace("    key: OPENAI_API_KEY\n", "    key: sk-live-0a1b2c3d4e5f6071\n")
  }
]);

async function measure(member: Member): Promise<Readonly<{
  mutated: boolean; cliLine: string; curated: string;
}>> {
  const mutated = member.apply(COMMITTED);
  if (mutated === COMMITTED) return { mutated: false, cliLine: "ANCHOR_NOT_FOUND", curated: "ANCHOR_NOT_FOUND" };
  writeFileSync(MODELS, mutated, "utf8");
  try {
    let cliLine = "NO_FAILURE";
    try {
      await operations().generateContract();
    } catch (error) {
      cliLine = developmentAuthStackErrorCode(
        new DevelopmentAuthStackError("DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED", error)
      );
    }
    const lines: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
    try {
      await operations().checkModelConfig();
    } catch {
      // expected
    } finally {
      console.error = original;
    }
    const curated = lines.find((l) => l.startsWith("DEV_AUTH_STACK_MODEL_CONFIG_INVALID")) ?? "NONE";
    return { mutated: true, cliLine, curated };
  } finally {
    writeFileSync(MODELS, COMMITTED, "utf8");
  }
}

describe("REV-S03-p3r-product-truth — step 7's shape-fault class, member by member", () => {
  afterAll(() => {
    writeFileSync(MODELS, COMMITTED, "utf8");
    expect(readFileSync(MODELS, "utf8")).toBe(COMMITTED);
  });

  for (const member of MEMBERS) {
    it(`member: ${member.name}`, async () => {
      const result = await measure(member);
      console.log(`[PROBE p3r sweep] ${member.name}`);
      console.log(`[PROBE p3r sweep]   CLI prints today : ${JSON.stringify(result.cliLine)}`);
      console.log(`[PROBE p3r sweep]   stage 2 would say: ${JSON.stringify(result.curated)}`);
      expect(result.mutated).toBe(true);
      // Recorded, not predicted: whether each member is refused at all, and by which stage.
      expect(typeof result.cliLine).toBe("string");
    }, 180_000);
  }

  it("the committed file is byte-identical after the sweep", () => {
    expect(readFileSync(MODELS, "utf8")).toBe(COMMITTED);
  });
});
