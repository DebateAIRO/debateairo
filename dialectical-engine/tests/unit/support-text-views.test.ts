import { describe,expect,it } from "vitest";

import {
  canonicalSupportTextViews,supportTextHasUnsafePath
} from "../../packages/kernel/src/support-text-views.js";

describe("CP1 bounded canonical Support text views", () => {
  it.each([
    ["p%61ssword","password"],
    ["p%2561ssword","password"],
    ["%EF%BD%90%EF%BD%81%EF%BD%93%EF%BD%93%EF%BD%97%EF%BD%8F%EF%BD%92%EF%BD%84","password"],
    ["pass%E2%80%8Bword","password"],
    ["https%253A%252F%252Fexample.test/reset","https://example.test/reset"]
  ])("decodes valid transformations to a fixed point: %s", (input,expected) => {
    const result = canonicalSupportTextViews(input);
    expect(result.views).toContain(expected);
    expect(result.unsafeEncoding).toBe(false);
  });

  it.each([
    "https%252525253A%252525252F%252525252Fexample.test/reset",
    "%2525252570assword",
    "%252525252Fsettings",
    "https%3"
  ])("flags dangerous encoding that remains at or beyond the bound: %s", (input) => {
    expect(canonicalSupportTextViews(input).unsafeEncoding).toBe(true);
  });

  it.each(["Progress is 50% complete.","The export is 100% local."])(
    "preserves a benign percentage: %s",(input) => {
      expect(canonicalSupportTextViews(input)).toMatchObject({ unsafeEncoding: false });
    }
  );

  it.each([
    "/settings","../settings",".\\settings","C:\\Users\\visitor\\secret.txt",
    "\\\\server\\share\\secret.txt","%2Fsettings","..%2Fsettings",
    ...["=",":",",",";"].flatMap((delimiter) => [
      `Target${delimiter}\\settings`,
      `Target${delimiter}C:\\settings`,
      `Target${delimiter}\\\\server\\share`,
      `Target${delimiter}%5Csettings`,
      `Target${delimiter}C:%5Csettings`,
      `Target${delimiter}%5C%5Cserver%5Cshare`
    ])
  ])("recognizes every canonical filesystem and route path form: %s",(input) => {
    expect(supportTextHasUnsafePath(input)).toBe(true);
  });

  it.each([
    "Progress is 50% complete.",
    "Choose Settings from the account page.",
    "The ratio is 3/4 when four observations are available.",
    "Progress=84% complete.",
    "Ratio=3/4 with four observations.",
    "Time=14:30 local.",
    "Version=1.2.3 is available."
  ])("does not classify ordinary prose as a path: %s",(input) => {
    expect(supportTextHasUnsafePath(input)).toBe(false);
  });
});
