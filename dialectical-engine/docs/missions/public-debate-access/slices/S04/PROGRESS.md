# PROGRESS — S04

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

## NEXT

- ARCH-01 authors PLAN steps for S04-C1..C4; runs as the close gate after PROG-01. Its scope now includes whatever V rules on Row 4.

## TRIED AND FAILED

- Nothing yet for this slice. (Router-level: `osascript` visible-window launch is blocked by macOS Automation permission — do not retry it, it needs V. See V-DECISIONS-PACKET.md Row 3.)

## WORKED

- Naming the anonymous-exposure review as its own slice rather than a checklist item on S01 — the widened envelope is new public surface and deserves an independent verdict.
- Naming anonymous-exposure review as its own slice: V packet Row 4 emerged precisely because someone was looking at exposure as a first-class question.
