// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe,expect,it,vi } from "vitest";
import { Assistant } from "../../apps/ui/components/support/Assistant.js";

describe("SUP-03 public-only Support UI", () => {
  it("renders no private-context controls or attachment claims", () => {
    const html = renderToStaticMarkup(<Assistant fullPage signedIn client={{
      createSession: vi.fn(),sendMessage: vi.fn(),rate: vi.fn(),escalate: vi.fn()
    }} />);
    expect(html).not.toMatch(/Attach a debate|consent toggle|My latest debate|question line|run id|selected debate context|session and device details/iu);
  });

  it("has no picker, consent, or private answer request wiring", async () => {
    const [assistant,widget] = await Promise.all([
      readFile("apps/ui/components/support/Assistant.tsx","utf8"),
      readFile("apps/ui/components/support/SupportWidget.tsx","utf8")
    ]);
    expect(assistant).not.toMatch(/ConsentToggle|DebatePicker|setConsent|ownContext|run_id|\blatest\b/iu);
    expect(widget).not.toMatch(/initialContext|context\s*:/u);
    expect(assistant).not.toContain("/api/v1/answers");
  });
});
