# PROGRESS — T9

**Writer after seed:** orchestrator only.

REQUIREMENTS DRAFTED — awaiting review

## 2026-08-31 — Wave 0 (T9-C3) review round 1: REWORK
- Opus 5 blind review of 55b18ee: REWORK — B1 blocking (ModeToggle `JSX.Element` fails TS2503
  under @types/react 19; traced to ADR-002's own published contract; root tsconfig excludes
  apps/ui so the mandated gate never compiled the file) + N1/N2/N3 green structural mutants
  (guard position, stale 1-199 exclusion window, suppressHydrationWarning unpinned).
- Everything else CONFIRMED independently: acceptance 11/11 x3, render 78/78, token fidelity
  89x2+24 exact, all 69 legacy names, RED reproduced byte-for-byte, ADR-002 conformance.
- Coverage hole CH1 found: no pin for a mode control on the ANONYMOUS landing (SPEC R3) —
  routed to ARCH-01-AM2, which adds the T9-C1 acceptance row.
- Done: 11 findings ticketed (RW1-B1/N1/N2/N3 to worker; N4-N7 orchestrator; CH1+AM2 to ARCH;
  PRE1 baselined), reviewer receipt+tokens in LEDGER.md, ARCH-01-AM2 dispatched 21:10
  (session bb69b040), CODE-T9C3-RW1 packet drafted with AM2-FILL placeholders.
- Next: AM2 exits -> fill RW1 packet verbatim from amended ADRs -> pre-dispatch validation
  (IDs resolve, scope subset, boundaries match, counts re-measured) -> epoch 3 -> resume
  codex session 01a058b3-1e70-7d53-b950-770c130310e0. Rework budget after this round: 2.
- Tried+failed this cycle: `hermes kanban task create` (no such action) and `create --title`
  (title is positional) — correct form recorded here to stop the third repeat.
