# CODE-T9C2-N2 — addendum 2: cells T9-C2-6 and T9-C2-7 (ticket t_6eed8efc, AM9 cells)

Same codex seat, same session (01a05a3c). AM9 (commit ce5016e) published two new cells in
YOUR row's surface — no surface changes, verified. Both are product+test this time.

## Supersessions in force
T9-C2-2 narrowed (AM8); T9-C2-5 folded (N2); PLAN:116's old ref regex SUPERSEDED by the
AM9 dispatch cell (uuid kind); ADR-004 §Decision AND §Wiring both normative (AM9).

## The charges (cells verbatim in dispatch-order row 4 — read them there first)
1. **T9-C2-6:** `LoginFlow.tsx:115`'s `Create one` link forwards `next`
   (`/sign-up?next=%2Fnew` when present; bare `/sign-up` when absent — mirror SignUpFlow's
   only-when-present pattern). Pin per the cell: render LoginFlow at `/login?next=%2Fnew`,
   assert the href; AND the round trip end-to-end (Create one → Already have one? Log in →
   decoded `next` still `/new`). Do NOT add a second validation site — transport only.
2. **T9-C2-7:** in `apps/ui/lib/returnPath.ts`, the public-debate kind becomes
   `/^\/public\/debate\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/`
   (the contract's z.uuid() reality). In `tests/unit/t9-return-path.test.ts` add THREE rows:
   `/public/debate/..` → DEFAULT; `/public/debate/.` → DEFAULT; ACCEPT-case
   `/public/debate/3f2a1b4c-9d8e-4f70-b1c2-5a6d7e8f9012` unchanged (the fail-closed alarm —
   required). Update the existing `abc-123` accept rows to uuid refs (they are now REJECTED
   by the tightened kind — that flip is EXPECTED; show it happening, then fix the rows to
   real uuids and show green. State each row you touch).

## Reproduce-first
T9-C2-6: current suite green with the bare link (the defect), add pin → RED, implement →
GREEN; mutant: drop the parameter on the RETURN leg → RED. T9-C2-7: `..`/`.` accepted today
(the defect, show it), tighten → rows green; mutant: revert the regex to the old class →
accept-case still green but dot-rows RED.

## Acceptance
Row-4 command 3x worst-run green (count grows); render suite green; canonical gate 0-new;
oracle 0; storage guards 0; SHA proofs for LoginFlow.tsx and returnPath.ts both directions.
Writes: those two product files + the two test files + self-report append + board comments
on t_6eed8efc. No git.

## Handoff
Final comment on t_6eed8efc: `ADDENDUM COMPLETE` + per-cell evidence + `SKILLS LOADED:` +
`comments read through:`. Keep the session resumable.
