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
    const path = "/public/debate/7f6c5b4a-3210-4fed-8cba-9876543210ab";

    expect(safeReturnPath(path)).toBe(path);
  });

  it("accepts a UUID public debate path", () => {
    const path = "/public/debate/3f2a1b4c-9d8e-4f70-b1c2-5a6d7e8f9012";

    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([
    ["/new?x=1", "/new?x=1"],
    [
      "/public/debate/a1b2c3d4-e5f6-4789-abcd-0123456789ef?from=share",
      "/public/debate/a1b2c3d4-e5f6-4789-abcd-0123456789ef?from=share"
    ]
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
    ["public debate dot-dot ref", "/public/debate/.."],
    ["public debate dot ref", "/public/debate/."],
    ["overlong public debate ref", `/public/debate/${"a".repeat(129)}`],
    ["null", null],
    ["undefined", undefined],
    ["empty", ""]
  ])("rejects %s", (_case, raw) => {
    expect(safeReturnPath(raw)).toBe(DEFAULT_RETURN_PATH);
  });
});
