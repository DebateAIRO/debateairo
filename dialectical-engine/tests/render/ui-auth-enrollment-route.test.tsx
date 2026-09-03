// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EnrollMfaPage from "../../apps/ui/app/enroll-mfa/page.js";

/* The token-consumption half of this contract lives in tests/unit/mfa-ui.test.ts.
   What is asserted here is the enrolment route's own shape: the typed inputs it
   owns, and the absence of a native credential form on either route. */
describe("MFA enrolment route shape", () => {
  it("owns the typed enrolment inputs and exposes no native credential form", () => {
    const verifySource = readFileSync(join(process.cwd(), "apps/ui/app/verify-email/page.tsx"), "utf8");
    const enrollSource = readFileSync(join(process.cwd(), "apps/ui/app/enroll-mfa/page.tsx"), "utf8");

    expect(enrollSource).toContain('id="totp-code"');
    expect(enrollSource).toContain('id="recovery-typeback"');
    expect(verifySource).not.toMatch(/<form\b/);
    expect(enrollSource).not.toMatch(/<form\b/);
    expect(renderToStaticMarkup(<EnrollMfaPage />)).not.toMatch(/<form\b/);
  });
});
