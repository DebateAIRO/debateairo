import { describe, expect, it } from "vitest";
import {
  LEGACY_RELEASE_KEY,
  TypedDomainError,
  parseReleaseKey,
  releaseCodePart,
  releaseTaskName
} from "@debateai/kernel";

/**
 * The release key (side-by-side uploads spec 2026-10-21 §1, INTERFACE "Shared code"): `r<site settings version>-<first
 * 12 hex of the source revision>`, lowercase because Hatchet lowercases names. `legacy` is the stamp of a run written
 * before 0123 or without a key; it is never a key a process may run as.
 */
const refusal = (raw: unknown): unknown => {
  try {
    parseReleaseKey(raw);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("parseReleaseKey", () => {
  it("reads the site version and the 12-hex code part of a well-formed key, frozen", () => {
    const parsed = parseReleaseKey("r17-d50e33165a1b");
    expect(parsed).toEqual({ releaseKey: "r17-d50e33165a1b", siteVersion: 17, codeRevision12: "d50e33165a1b" });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parseReleaseKey("r1-000000000000").siteVersion).toBe(1);
    expect(parseReleaseKey("r120-abcdef012345").siteVersion).toBe(120);
  });

  it("refuses legacy, malformed keys and non-strings with RELEASE_KEY_INVALID, never echoing the value", () => {
    for (const raw of [
      LEGACY_RELEASE_KEY, "", "r17-D50E33165A1B", "r0-d50e33165a1b", "r017-d50e33165a1b", "r17-d50e33165a1", "r17-d50e33165a1bc",
      "R17-d50e33165a1b", "17-d50e33165a1b", "r17_d50e33165a1b", " r17-d50e33165a1b", "r17-d50e33165a1b\n", "r-d50e33165a1b",
      "r17-g50e33165a1b", "r99999999999999999999-d50e33165a1b", 17, null, undefined, { releaseKey: "r17-d50e33165a1b" }
    ]) {
      const error = refusal(raw);
      expect(error, String(raw)).toBeInstanceOf(TypedDomainError);
      expect((error as TypedDomainError).code).toBe("RELEASE_KEY_INVALID");
      if (typeof raw === "string" && raw !== "") expect((error as Error).message).not.toContain(raw.trim());
    }
  });
});

describe("releaseTaskName", () => {
  it("names the release's own Hatchet task, lowercase; legacy keeps the base unchanged", () => {
    expect(releaseTaskName("debateai-run", "r17-d50e33165a1b")).toBe("debateai-run-r17-d50e33165a1b");
    expect(releaseTaskName("DebateAI-Run", "r17-d50e33165a1b")).toBe("debateai-run-r17-d50e33165a1b");
    expect(releaseTaskName("DebateAI-Run", LEGACY_RELEASE_KEY)).toBe("DebateAI-Run");
  });

  it("refuses a malformed key instead of minting a name no runner serves", () => {
    expect(() => releaseTaskName("debateai-run", "r17-D50E33165A1B")).toThrow(TypedDomainError);
  });
});

describe("releaseCodePart", () => {
  it("is the 12 hex the browser compares; legacy stays legacy", () => {
    expect(releaseCodePart("r17-d50e33165a1b")).toBe("d50e33165a1b");
    expect(releaseCodePart(LEGACY_RELEASE_KEY)).toBe("legacy");
    expect(() => releaseCodePart("r0-d50e33165a1b")).toThrow(TypedDomainError);
  });
});
