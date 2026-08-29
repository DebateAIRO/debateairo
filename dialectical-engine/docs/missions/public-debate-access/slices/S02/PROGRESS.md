# PROGRESS — S02

**Writer:** the ORCHESTRATOR, and only the orchestrator. REQ-01 (requirements) created
the headings and left them empty — verified at 11 lines each before any fold-in. Every
line below this point was written by the orchestrator, dated at fold-in. No other seat
writes here; if you are not the orchestrator and you want something recorded, put it on
the ticket and the orchestrator folds it in.

## DONE

- 2026-08-29 · SPEC.md frozen at creation by REQ-01 (Grok). Not edited since — frozen means frozen.
- 2026-08-29 · PLAN.md skeleton created: cluster ids reserved, SPEC-trace headings, quantifiability law. No steps authored (correct — Architecture fills).
- 2026-08-29 · DECISIONS.md seeded with V's full-parity ruling and the Router's read-vs-mutation assumption (labelled as an assumption, not a ruling).

- 2026-08-29 · REV-01 (Claude, blind SPEC review) returned **PASS**. SPEC↔PLAN traces verified 1:1 in both directions across all four slices; PLAN files confirmed genuine skeletons; no banned acceptance words. INSTRUCTIONS.md 62 lines.
- 2026-08-29 · REV-00 (Grok, blind review of the Router's own intake) returned **PASS** with four findings AGAINST THE ROUTER — all ticketed and fixed. The load-bearing one: the back-compat 404 mechanism is REQUIRED KEYS + catch→null + handler null→404, **not** `.strict()`. INTAKE corrected before architecture read it.
- 2026-08-29 · REV-01 finding N2 (`t_68386dd8`) ACCEPTED and independently re-verified by the Router: `getDebateScoring` is a hardcoded stub (`Promise.resolve(scoringUnavailable(id))`, DR-115) and `grep -rn scoring apps/api/src/*.ts` returns ZERO matches. R6's "when absent" branch is the only branch that can ever fire, for owner and visitor alike.
- 2026-08-29 · REV-01 finding N1 (`t_d913b68b`): `cost_envelope` and `tier_provenance_ref` are rendered to the owner (AnswerHonestyDrawer.tsx:86,199-204) but banned from the public envelope by a pre-existing security test. Routed to V as **Row 4**, not decided by the fleet.

## NEXT

- REQ-01 rework round 1 of 3 IN FLIGHT for N2 — SPEC is frozen, so it issues a superseding version rather than an in-place edit. ARCH-01 waits on it.

## TRIED AND FAILED

- Nothing yet for this slice. (Router-level: `osascript` visible-window launch is blocked by macOS Automation permission — do not retry it, it needs V. See V-DECISIONS-PACKET.md Row 3.)

## WORKED

- Comparing the owner page against the public page surfaced the real parity gap early, instead of at QA.
- Re-verifying the reviewer's evidence before routing it: both N1 and N2 held, which is why they were routed rather than argued.
