import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_CODE_REVISION,
  LEGACY_RELEASE_KEY,
  RELEASE_KEY_PATTERN,
  TypedDomainError,
  developmentReleaseKey,
  isDevelopmentReleaseKey,
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

/** The thrown value of `fn`, or undefined when it returns. */
const thrownBy = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("the release key (side-by-side §1-§2)", () => {
  it("parses a well-formed key into its frozen parts", () => {
    const result = parseReleaseKey("r17-d50e33165a1b");
    expect(result).toEqual({ releaseKey: "r17-d50e33165a1b", siteVersion: 17, codeRevision12: "d50e33165a1b" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("refuses every malformed value with RELEASE_KEY_INVALID and a message that never repeats the input", () => {
    for (const raw of [
      "R17-d50e33165a1b", "r17-D50E33165A1B", "r0-d50e33165a1b", "r017-d50e33165a1b", "r17-d50e33165a1", "r17-d50e33165a1bc",
      "legacy", "", " r17-d50e33165a1b", "r9007199254740993-d50e33165a1b", 17, null, undefined
    ]) {
      const error = refusal(raw);
      expect(error, String(raw)).toBeInstanceOf(TypedDomainError);
      expect((error as TypedDomainError).code, String(raw)).toBe("RELEASE_KEY_INVALID");
      if (raw !== "") expect((error as Error).message, String(raw)).not.toContain(String(raw));
    }
  });

  it("names the release's Hatchet task; legacy keeps the bare base name; a blank base is a TypeError", () => {
    expect(releaseTaskName("debateai-prod", "r17-d50e33165a1b")).toBe("debateai-prod-r17-d50e33165a1b");
    expect(releaseTaskName("DebateAI-Prod", "r17-d50e33165a1b")).toBe("debateai-prod-r17-d50e33165a1b");
    expect(releaseTaskName("debateai-prod", LEGACY_RELEASE_KEY)).toBe("debateai-prod");
    expect((thrownBy(() => releaseTaskName("debateai-prod", "r17-X")) as TypedDomainError).code).toBe("RELEASE_KEY_INVALID");
    for (const base of ["", "  "]) {
      const error = thrownBy(() => releaseTaskName(base, "r17-d50e33165a1b"));
      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toBe("RELEASE_TASK_BASE_INVALID");
    }
  });

  it("gives the code part; legacy stays legacy; anything else is RELEASE_KEY_INVALID", () => {
    expect(releaseCodePart("r17-d50e33165a1b")).toBe("d50e33165a1b");
    expect(releaseCodePart("legacy")).toBe("legacy");
    expect((thrownBy(() => releaseCodePart("x")) as TypedDomainError).code).toBe("RELEASE_KEY_INVALID");
  });

  it("derives the development key r<v>-000000000000 only from a positive safe whole number", () => {
    expect(DEVELOPMENT_CODE_REVISION).toBe("000000000000");
    expect(RELEASE_KEY_PATTERN.source).toBe("^r[1-9][0-9]*-[0-9a-f]{12}$");
    expect(developmentReleaseKey(4)).toBe("r4-000000000000");
    for (const version of [0, 1.5, -1, Number.MAX_SAFE_INTEGER + 2]) {
      const error = thrownBy(() => developmentReleaseKey(version));
      expect(error, String(version)).toBeInstanceOf(TypedDomainError);
      expect((error as TypedDomainError).code, String(version)).toBe("RELEASE_KEY_INVALID");
    }
  });

  it("tells a development key from a release's own key", () => {
    expect(isDevelopmentReleaseKey("r4-000000000000")).toBe(true);
    expect(isDevelopmentReleaseKey("r4-d50e33165a1b")).toBe(false);
  });
});

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
