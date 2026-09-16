// REV-S03-p3r-product-truth — SPEC-v3 §2 acceptance STEP 7 ("the broken edit") at b97985a8,
// measured as the CLI actually prints it.
//
// V-49 put `generate:contract` at STAGE 1 of dev:auth:up (dev-auth-stack.ts:155-157), ahead of
// the model-config check at stage 2 (:158-161), whose handler prints the product's curated line
//   DEV_AUTH_STACK_MODEL_CONFIG_INVALID tier=<t> model=<m> class <n>        (:312-314)
// Step 7 requires "a message naming the tier, the entry's model id and the failure class".
//
// The generator runs through execFileAsync (:297-305), so its stderr is CAPTURED, and the CLI
// prints only `developmentAuthStackErrorCode(error)` (:119-128 + dev-auth-stack-cli.ts:52-55),
// a colon-joined chain of messages matching /^DEV_[A-Z0-9_]+$/. An ExecFileException's message
// ("Command failed: pnpm generate:contract…") does not match, so it contributes nothing.
//
// This fixture RUNS both stages against a config/models.yaml that its shell wrapper has already
// mutated with step 7's own example fault (`api: acme`), and records the exact operator-visible
// string for each. It asserts nothing about which is better; it records what V sees.
//
// Wrapper: mutant-step7-broken-edit-cli.sh (capture -> mutate -> this -> restore -> cmp).

import { describe, expect, it } from "vitest";
import {
  createDevelopmentAuthStackOperations,
  developmentAuthStackErrorCode,
  DevelopmentAuthStackError
} from "../../apps/runner/src/dev-auth-stack.js";

const ROOT = process.cwd();

// Only what the child needs to run at all; the product spreads this into the child's env.
const COMMAND_ENVIRONMENT = Object.freeze({
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? ""
});

function operations() {
  return createDevelopmentAuthStackOperations(ROOT, COMMAND_ENVIRONMENT);
}

// Exactly what fixedStage(code, op) does on a throw (dev-auth-stack.ts:129-136).
function asStageFailure(code: string, cause: unknown): DevelopmentAuthStackError {
  return new DevelopmentAuthStackError(code, cause);
}

describe("REV-S03-p3r-product-truth — step 7, the broken edit, as the CLI prints it at b97985a8", () => {
  it("S7a the file under test really is shape-faulted (the wrapper mutated it)", async () => {
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(`${ROOT}/config/models.yaml`, "utf8");
    console.log(`[PROBE p3r step7] models.yaml contains 'api: acme'? ${text.includes("api: acme")}`);
    expect(text).toContain("api: acme");
  });

  it("S7b STAGE 1 (V-49's generator) — what dev:auth:up prints for a shape fault", async () => {
    let printed = "NO_FAILURE";
    try {
      await operations().generateContract();
    } catch (error) {
      printed = developmentAuthStackErrorCode(
        asStageFailure("DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED", error)
      );
    }
    console.log(`[PROBE p3r step7] the operator-visible line = ${JSON.stringify(printed)}`);
    console.log(`[PROBE p3r step7] names the tier 'free'?      ${printed.includes("free")}`);
    console.log(`[PROBE p3r step7] names the model id?         ${printed.includes("gpt-5.6-luna")}`);
    console.log(`[PROBE p3r step7] names a failure class?      ${/class|MODEL_CONFIG/u.test(printed)}`);
    expect(printed).toBe("DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED");
    expect(printed).not.toContain("free");
    expect(printed).not.toContain("gpt-5.6-luna");
  }, 120_000);

  it("S7c STAGE 2 (the model check) — the curated line V would have seen, on the same broken file", async () => {
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
    const curated = lines.find((line) => line.startsWith("DEV_AUTH_STACK_MODEL_CONFIG_INVALID")) ?? "NONE";
    console.log(`[PROBE p3r step7] stage 2 would have printed = ${JSON.stringify(curated)}`);
    expect(curated).toContain("tier=free");
    expect(curated).toContain("model=gpt-5.6-luna");
    expect(curated).toMatch(/class \d/u);
  });
});
