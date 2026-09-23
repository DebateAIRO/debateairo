// REV-S03-p1-product-truth — the lens's OWN file fixtures, built from V's own
// sentence for the restart ("it first checks the file … typos, a CLI that isn't
// installed … refuses without touching anything") and from SPEC-v3 acceptance
// step 7, NOT from the author's fixtures.
//
// Every case is an edit V could plausibly make to config/models.yaml, applied
// to a scratch repository root (never .local, never the live stack).
// What is asserted is the PRODUCT observable: the refusal names the tier, the
// entry's model and a class; and no key-looking value is ever echoed back.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { loadModelConfig, ModelConfigShapeError } from "../../packages/model-config/src/index.js";

const COMMITTED = readFileSync(
  join(process.cwd(), "config/models.yaml"), "utf8"
);

const roots: string[] = [];

function rootWith(yaml: string): string {
  const root = mkdtempSync(join(tmpdir(), "rev-s03-p1-product-truth-"));
  roots.push(root);
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "config/models.yaml"), yaml, "utf8");
  return root;
}

function refusalFor(yaml: string): ModelConfigShapeError {
  const root = rootWith(yaml);
  try {
    loadModelConfig(root);
  } catch (error) {
    if (error instanceof ModelConfigShapeError) return error;
    throw new Error(`expected a ModelConfigShapeError, received ${String(error)}`);
  }
  throw new Error("the file was ADMITTED — no refusal was raised");
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("REV-S03-p1-product-truth — V's plausible broken edits", () => {
  it("CONTROL — the committed file, copied to a scratch root, is ADMITTED", () => {
    const config = loadModelConfig(rootWith(COMMITTED));
    expect(config.free.map((entry) => entry.model)).toEqual(["gpt-5.6-luna", "glm-5.3-flash"]);
    expect(config.premium.map((entry) => entry.model))
      .toEqual(["gpt-5.6-sol", "claude-opus-5", "grok-4.6-build"]);
  });

  it("V pastes an ACTUAL KEY into key: — refused, and the key value is NOT echoed", () => {
    const secret = "sk-proj-REVS03PROBEdeadbeefdeadbeefdeadbeef";
    const error = refusalFor(COMMITTED.replace("key: OPENAI_API_KEY", `key: ${secret}`));
    expect(error.code).toBe("MODEL_CONFIG_KEY_NAME_INVALID");
    expect(error.tier).toBe("free");
    expect(error.model).toBe("gpt-5.6-luna");
    expect(typeof error.classNumber).toBe("number");
    // The refusal must not carry the pasted secret anywhere.
    const rendered = `${error.message} ${String(error)} ${JSON.stringify(error)}`;
    expect(rendered).not.toContain(secret);
    expect(rendered).not.toContain("sk-proj");
  });

  it("V invents a transport word (api: acme) — refused, naming that entry", () => {
    const error = refusalFor(COMMITTED.replace("api: zai", "api: acme"));
    expect(error.code).toBe("MODEL_CONFIG_ENTRY_TRANSPORT_UNKNOWN");
    expect(error.tier).toBe("free");
    expect(error.model).toBe("glm-5.3-flash");
  });

  it("V adds a SECOND Anthropic entry to premium — refused (one maker per tier)", () => {
    const error = refusalFor(COMMITTED.replace(
      "  - cli: grok\n    model: grok-4.6-build",
      "  - cli: claude\n    model: claude-haiku-5"
    ));
    expect(error.code).toBe("MODEL_CONFIG_TIER_ROSTER_INVALID");
    expect(error.tier).toBe("premium");
  });

  it("V's base_url carries a query string — refused", () => {
    const error = refusalFor(COMMITTED.replace(
      "base_url: https://api.z.ai/api/coding/paas/v4",
      "base_url: https://api.z.ai/api/coding/paas/v4?key=abc"
    ));
    expect(error.code).toBe("MODEL_CONFIG_BASE_URL_INVALID");
    expect(error.tier).toBe("free");
    expect(error.model).toBe("glm-5.3-flash");
  });

  it("V's base_url carries credentials — refused, and the password is NOT echoed", () => {
    const error = refusalFor(COMMITTED.replace(
      "base_url: https://api.z.ai/api/coding/paas/v4",
      "base_url: https://user:REVS03SECRETPW@api.z.ai/api/coding/paas/v4"
    ));
    expect(error.code).toBe("MODEL_CONFIG_BASE_URL_INVALID");
    const rendered = `${error.message} ${String(error)} ${JSON.stringify(error)}`;
    expect(rendered).not.toContain("REVS03SECRETPW");
  });

  it("V deletes a whole tier — refused", () => {
    const error = refusalFor(COMMITTED.slice(0, COMMITTED.indexOf("premium:")));
    expect(typeof error.code).toBe("string");
    expect(error.code.startsWith("MODEL_CONFIG_")).toBe(true);
  });

  it("V mistypes the indentation (invalid YAML) — refused, not silently half-read", () => {
    const error = refusalFor(COMMITTED.replace("free:", "free:\n   \t- broken: ["));
    expect(error.code).toBe("MODEL_CONFIG_FILE_MALFORMED");
  });

  it("R30 STANDING RISK — glm-4.7 (what V ASKED for) is ADMITTED by the file check", () => {
    // V's words were "switch the 5.3 to GLM 4.7". V-37 answered that the
    // subscription answers glm-4.7 AS glm-5.3-flash, so the id must be
    // glm-5.3-flash. If V ever edits it back to glm-4.7, the FILE check admits
    // it — the echo rule (R30) only bites later, as an availability warning.
    const config = loadModelConfig(rootWith(COMMITTED.replace("model: glm-5.3-flash", "model: glm-4.7")));
    expect(config.free.map((entry) => entry.model)).toEqual(["gpt-5.6-luna", "glm-4.7"]);
  });

  it("V-39 STANDING RISK — a file with NO cli: entry at all is ADMITTED", () => {
    // Legal under R2-R6 and none of R20's six classes. Slot 0 then stops being
    // a loopback relay, which is the case row V-39 put to V.
    const apiOnly = [
      "free:",
      "  - api: openai",
      "    model: gpt-5.6-luna",
      "    base_url: https://api.openai.com/v1",
      "    key: OPENAI_API_KEY",
      "  - api: zai",
      "    model: glm-5.3-flash",
      "    base_url: https://api.z.ai/api/coding/paas/v4",
      "    key: ZAI_API_KEY",
      "",
      "premium:",
      "  - api: openai",
      "    model: gpt-5.6-sol",
      "    base_url: https://api.openai.com/v1",
      "    key: OPENAI_API_KEY",
      "  - api: zai",
      "    model: glm-5.3",
      "    base_url: https://api.z.ai/api/coding/paas/v4",
      "    key: ZAI_API_KEY",
      ""
    ].join("\n");
    const config = loadModelConfig(rootWith(apiOnly));
    expect(config.premium.every((entry) => entry.transport === "api")).toBe(true);
  });
});
