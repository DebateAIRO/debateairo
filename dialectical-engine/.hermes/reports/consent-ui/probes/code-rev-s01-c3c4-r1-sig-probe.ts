// CODE-REV-S01-C3C4 r1 — TYPE-LEVEL probe of the C2 follow-up (N2).
// vitest cannot see a type-level remedy; the compiler is the only witness.
import { decisionFor } from "../apps/ui/lib/consent.js";

// CASE 1 — the R04 row-3 call the SPEC pins: `Essential only` offered by the
// CARD, which has toggles on screen, must produce the identical object as the
// bar's. Shape copied from tests/render/consent-storage.test.tsx:203.
export const row3FromCard = decisionFor("essential-only", { quality: true, analytics: true });

// CASE 2 — the row-3 call from the BAR, with no toggles at all.
export const row3FromBar = decisionFor("essential-only");

// CASE 3 — the defect N2 names: `save-choices` with the toggles omitted.
// This MUST NOT compile.
// @ts-expect-error decisionFor("save-choices") must be a compile error (N2)
export const row4Denied = decisionFor("save-choices");

// CASE 4 — the lawful row-4 call, which C4's Save choices handler makes.
export const row4 = decisionFor("save-choices", { quality: true, analytics: false });
