import { describe, expect, it, vi } from "vitest";
import { resolveSupportInboxArguments } from "../../apps/runner/src/support-inbox-cli.js";
import { parseSupportShredArguments } from "../../apps/runner/src/support-shred-cli.js";

/**
 * DL7-F11 (delta audit). Two operator commands handled dangerous input carelessly:
 *
 *  - `pnpm support:reply <case> <text>` took V's reply — a person's support answer, often
 *    quoting what the user wrote — on argv, where it lands in shell history and is readable
 *    by every local account through `ps`. The branch had already removed exactly this pattern
 *    for the mail recipient (L7-F7).
 *  - `pnpm support:shred --owner <ref>` destroys keys irreversibly with no confirmation, so
 *    one mistyped or mis-pasted argument silently erases a person's support history.
 */
describe("DL7-F11 — operator commands keep text off argv and confirm what cannot be undone", () => {
  it("reads the reply body from stdin when no text argument is given", async () => {
    const warn = vi.fn();
    const resolved = await resolveSupportInboxArguments(
      ["reply", "00000000-0000-4000-8000-000000000001"],
      async () => "the operator's answer\n",
      warn
    );
    expect(resolved).toEqual(["reply", "00000000-0000-4000-8000-000000000001", "the operator's answer"]);
    expect(warn, "the safe path is silent").not.toHaveBeenCalled();
  });

  it("still accepts a text argument but says on stderr why that is the worse way", async () => {
    const warn = vi.fn();
    const resolved = await resolveSupportInboxArguments(
      ["reply", "00000000-0000-4000-8000-000000000001", "on argv"],
      async () => { throw new Error("stdin must not be read when text was given"); },
      warn
    );
    expect(resolved).toEqual(["reply", "00000000-0000-4000-8000-000000000001", "on argv"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("SUPPORT_REPLY_TEXT_ON_ARGV");
  });

  it("refuses a reply body larger than the buffer it is willing to hold", async () => {
    await expect(resolveSupportInboxArguments(
      ["reply", "00000000-0000-4000-8000-000000000001"],
      async () => "x".repeat(64 * 1024 + 1),
      vi.fn()
    )).rejects.toThrow("SUPPORT_CASE_MESSAGE_TOO_LARGE");
  });

  it("leaves every other command untouched", async () => {
    const readStdin = async () => { throw new Error("stdin must not be read"); };
    for (const argv of [["show", "00000000-0000-4000-8000-000000000001"], ["close", "00000000-0000-4000-8000-000000000001"], []]) {
      expect(await resolveSupportInboxArguments(argv, readStdin, vi.fn())).toEqual(argv);
    }
  });

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
