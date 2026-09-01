import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETURN_PATH,
  RETURN_PATH_ALLOW_LIST,
  safeReturnPath
} from "../../apps/ui/lib/returnPath.js";

describe("T9 return-path validation", () => {
  it.each(RETURN_PATH_ALLOW_LIST)("accepts allow-listed path %s", (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it("accepts a bounded public debate path", () => {
    const path = "/public/debate/debate_ref-1.2~reader";

    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([
    ["/new?x=1", "/new?x=1"],
    ["/public/debate/abc-123?from=share", "/public/debate/abc-123?from=share"]
  ])("preserves accepted return path %s unchanged", (raw, expected) => {
    expect(safeReturnPath(raw)).toBe(expected);
  });

  it.each([
    ["scheme-relative authority", "//evil.example"],
    ["slash then backslash", "/\\evil"],
    ["leading backslash", "\\evil"],
    ["absolute URL", "http://evil"],
    ["allow-list prefix", "/newx"],
    ["path traversal", "/new/../settings"],
    ["missing public debate ref", "/public/debate/"],
    ["overlong public debate ref", `/public/debate/${"a".repeat(129)}`],
    ["null", null],
    ["undefined", undefined],
    ["empty", ""]
  ])("rejects %s", (_case, raw) => {
    expect(safeReturnPath(raw)).toBe(DEFAULT_RETURN_PATH);
  });
});
