import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_API_ENVIRONMENT_ERROR_CODES,
  developmentApiEnvironmentErrorCode
} from "../../apps/runner/src/dev-api-environment.js";

/**
 * F-DIAG-DEV-API-CLI. `apps/runner/src/dev-api-environment-cli.ts:13-16` printed a caught
 * error's own message whenever that message merely LOOKED like a code
 * (`/^DEV_API_ENVIRONMENT_[A-Z_]+$/u`) — the shape rule the landed pattern in
 * `apps/runner/src/dev-auth-stack.ts:84-108` considered and rejected in its own words: a
 * shape is not a vocabulary, and an uppercase-shaped message is still driver-influenced
 * text. The printed line is now drawn from an EXPLICIT set or the fixed fallback.
 *
 * The set below is written out INDEPENDENTLY here and is not imported from the subject, so
 * a widened or narrowed source set fails the first row rather than silently redefining what
 * "known" means. Every entry was read out of its producer by grep at authoring time
 * (2026-09-07); the comment carries the line of that code's FIRST throw.
 */
const PRODUCER_CODES = [
  // apps/runner/src/dev-api-environment.ts — `assembleDevelopmentApiEnvironment` and the
  // helpers it calls. These are the only DEV_API_ENVIRONMENT_* literals in the repository
  // outside the CLI's own fallback and the joiner's copy of this vocabulary.
  "DEV_API_ENVIRONMENT_CONCURRENT_LOCKED", //                  :250
  "DEV_API_ENVIRONMENT_CREDENTIAL_CUSTODY_INVALID", //         :101
  "DEV_API_ENVIRONMENT_CREDENTIAL_FILE_INVALID", //            :142
  "DEV_API_ENVIRONMENT_CREDENTIAL_REQUIRED", //                :344
  "DEV_API_ENVIRONMENT_CUSTODY_ROOT_INVALID", //               :91
  "DEV_API_ENVIRONMENT_DATABASE_CREDENTIAL_INVALID", //        :174
  "DEV_API_ENVIRONMENT_DEFINITION_INVALID", //                 :223
  "DEV_API_ENVIRONMENT_DRIFT", //                              :257
  "DEV_API_ENVIRONMENT_HATCHET_TOKEN_INVALID", //              :196
  "DEV_API_ENVIRONMENT_HISTORICAL_REGISTER_SOURCE_INVALID", // :408
  "DEV_API_ENVIRONMENT_OWNER_UNVERIFIED", //                   :75
  "DEV_API_ENVIRONMENT_PUBLISH_FAILED", //                     :288
  "DEV_API_ENVIRONMENT_SECRET_CUSTODY_INVALID" //              :124
] as const;

/** The one line the CLI prints when the failure is not a code it recognises. */
const FALLBACK = "DEV_API_ENVIRONMENT_FAILED";

/**
 * Synthetic only (D18). Shape-legal for the removed regex — the old rule would have printed
 * this verbatim — and absent from every producer.
 */
const SYNTHETIC_SENSITIVE = "DEV_API_ENVIRONMENT_PW_42_LEAKED_FROM_A_DRIVER";

describe("F-DIAG-DEV-API-CLI the printed code comes from a vocabulary, never from a shape", () => {
  it("admits exactly the codes its producers throw, and nothing else", () => {
    expect([...DEVELOPMENT_API_ENVIRONMENT_ERROR_CODES].sort()).toEqual([...PRODUCER_CODES].sort());
  });

  it("returns each producer code unchanged, so the printed line is byte-identical", () => {
    for (const code of PRODUCER_CODES) {
      expect(developmentApiEnvironmentErrorCode(new TypeError(code))).toBe(code);
    }
  });

  it("refuses a message that is code-SHAPED but is not a producer code", () => {
    const code = developmentApiEnvironmentErrorCode(new TypeError(SYNTHETIC_SENSITIVE));

    expect(code).not.toContain("PW_42");
    expect(code).toBe(FALLBACK);
  });

  /**
   * The other two producers the CLI calls — `loadDevelopmentProviderPanelFromEnvironment`
   * (apps/runner/src/dev-provider-panel.ts:77, :82, :89, :129) and
   * `loadDevelopmentCommandEnvironment` (packages/register/src/runtime-environment.ts:36,
   * a zod parse) — throw no DEV_API_ENVIRONMENT_* code at all. They reached the fallback
   * under the old rule too; this row keeps that true after the change.
   */
  it("returns the fallback for a sibling producer's code from another vocabulary", () => {
    expect(developmentApiEnvironmentErrorCode(new TypeError("DEV_CLI_PROVIDER_PANEL_REQUIRED")))
      .toBe(FALLBACK);
  });

  it("returns the fallback for anything that is not a TypeError carrying a producer code", () => {
    for (const thrown of [
      new Error("DEV_API_ENVIRONMENT_DRIFT"), // right code, wrong class — as before
      new TypeError("connect ECONNREFUSED 127.0.0.1:55432"),
      new TypeError(""),
      "DEV_API_ENVIRONMENT_DRIFT",
      undefined,
      null
    ]) {
      expect(developmentApiEnvironmentErrorCode(thrown)).toBe(FALLBACK);
    }
  });

  /**
   * The read-once rule the joiner already carries (dev-auth-stack.ts:300-305, codex r1 F3).
   * Validating one read of `message` and emitting another is not an allow-list: an accessor
   * that answers differently on the second read passes the check and then emits the
   * unchecked value. No concurrency is needed to build one.
   */
  it("reads the message ONCE, so an unstable accessor cannot slip past the set", () => {
    const shifty = new TypeError("placeholder");
    let reads = 0;
    Object.defineProperty(shifty, "message", {
      configurable: true,
      get: () => (reads++ === 0 ? "DEV_API_ENVIRONMENT_DRIFT" : SYNTHETIC_SENSITIVE)
    });

    const code = developmentApiEnvironmentErrorCode(shifty);

    expect(code).not.toContain("PW_42");
    expect(code).toBe("DEV_API_ENVIRONMENT_DRIFT");
  });

  /**
   * The persistent observer for the CLI file itself. The runtime rows above are satisfied by
   * a correct classifier even if the CLI kept its own shape rule beside it; only reading the
   * CLI's source shows that the decision was moved rather than duplicated.
   */
  it("leaves only the call in the CLI, with no message read and no shape rule", async () => {
    const cli = await readFile("apps/runner/src/dev-api-environment-cli.ts", "utf8");

    expect(cli).toContain("developmentApiEnvironmentErrorCode(error)");
    // the printed contract, both lines, unchanged
    expect(cli).toContain(
      "DEV_API_ENVIRONMENT_READY=${receipt.keyCount}:${receipt.reused ? \"REUSED\" : \"CREATED\"}"
    );
    expect(cli).toContain("console.error(code)");
    expect(cli).toContain("process.exitCode = 1");
    // and neither the message forward nor the shape rule survives in this file
    expect(cli).not.toContain("error.message");
    expect(cli).not.toContain("DEV_API_ENVIRONMENT_[A-Z_]");
  });
});
