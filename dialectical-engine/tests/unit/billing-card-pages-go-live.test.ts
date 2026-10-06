import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// P19 built the card form and the security policy of the three card pages (/checkout, /checkout/return,
// /settings/card) before the owner's xMoney stage recording (task X0, Step 7, its "(e)" item) existed, so its six
// X0 (e) choices are defaults, not measured answers. A dated note
// under the go-live table binds row 20 (which arrives with P22's billing rows 14–26) to all six, the way P16a's note
// binds row 16. This pins the note, and ties it to the Payment Request record that row 20 reads.
const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const CHECKLIST = "docs/missions/2026-09-01-security-hardening/GO-LIVE-CHECKLIST.md";
const CARD_PAGE_PINS = "apps/ui/lib/contentSecurityPolicy.test.mjs";
/** The titles of P19's two Payment Request pins; whichever one is in the file is the record of X0's answer. */
const KEEPS_PAYMENT_OFF =
  "X0 (e): the card documents keep payment=() like every page (xMoney's form needs no Payment Request API)";
const ALLOWS_PAYMENT_REQUEST =
  "X0: only the three card documents may use the Payment Request API, only for xMoney's origin, read per request";

describe("P19 card pages and go-live row 20 (X0 (e))", () => {
  it("binds row 20 to X0's six answers about the card pages, before billing goes on", () => {
    const checklist = read(CHECKLIST);
    const start = checklist.search(/^\*Note added 2026-10-02 \(paid plans P19\), binding on row 20 /mu);
    expect(start, "the P19 note that binds row 20").toBeGreaterThan(-1);
    const lastRow = [...checklist.matchAll(/^\| \d+ \|/gmu)].at(-1);
    expect(lastRow, "the go-live table").toBeDefined();
    expect(start, "the note sits under the table").toBeGreaterThan(lastRow?.index ?? Number.POSITIVE_INFINITY);
    const next = checklist.indexOf("\n*Note added", start + 1);
    const note = checklist.slice(start, next === -1 ? undefined : next);
    for (const needle of [
      "Row 20 is not proven until X0's notes and its `tests/fixtures/xmoney/` files answer all six",
      "before `billingPolicy.enabled` is set to `true`",
      // 1. The form's names.
      "`complete submit=function destroy=function destroyed=ok`", "`apps/ui/lib/billing/xmoneySdk.ts`",
      // 2. The origins.
      "`tests/fixtures/xmoney/csp-report.json`", "`cardFormContentSecurityPolicy`",
      // 3. form-action.
      "only if that report has a `form-action` row",
      // 4. The referrer.
      "`Referrer-Policy: no-referrer`", "`Referrer-Policy: strict-origin`",
      // 5. When onError fires.
      "when xMoney called the form's `onError`", "`billing.checkout.formUnavailable`",
      // 6. The Payment Request record: the pin in the file today, and the one that replaces it.
      `"${KEEPS_PAYMENT_OFF}"`, `"${ALLOWS_PAYMENT_REQUEST}"`
    ]) {
      expect(note, needle).toContain(needle);
    }
  });

  it("keeps exactly one of P19's two Payment Request pins in the file, the record row 20 reads", () => {
    const pins = read(CARD_PAGE_PINS);
    const recorded = [KEEPS_PAYMENT_OFF, ALLOWS_PAYMENT_REQUEST].filter((title) => pins.includes(`test("${title}"`));
    expect(recorded).toHaveLength(1);
  });
});
