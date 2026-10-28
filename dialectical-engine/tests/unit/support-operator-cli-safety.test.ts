import { describe, expect, it } from "vitest";
import { parseSupportShredArguments } from "../../apps/runner/src/support-shred-cli.js";

/**
 * DL7-F11 (delta audit). `pnpm support:shred --owner <ref>` destroys keys irreversibly with no confirmation, so
 *    one mistyped or mis-pasted argument silently erases a person's support history.
 */
describe("DL7-F11 — irreversible support shred requires confirmation", () => {
  it("refuses an irreversible shred that was not explicitly confirmed", () => {
    const target = "00000000-0000-4000-8000-000000000002";
    expect(() => parseSupportShredArguments(["--owner", target]))
      .toThrow("SUPPORT_SHRED_UNCONFIRMED");
    expect(parseSupportShredArguments(["--owner", target, "--yes"]))
      .toEqual({ kind: "owner", targetRef: target });
    expect(parseSupportShredArguments(["--session", target, "--yes"]))
      .toEqual({ kind: "session", targetRef: target });
    expect(() => parseSupportShredArguments(["--owner", target, "--maybe"]))
      .toThrow("SUPPORT_SHRED_USAGE");
  });
});
