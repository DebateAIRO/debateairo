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

## 2026-08-31 evening — rework loop rounds 1-2
- RW1 (codex, 18 min, commit 94c3bcf): all four findings fixed with reproduce-first + neighbor
  specificity controls; 13/13 worst-of-three; REV2 CONFIRMED all four ("best-disciplined
  rework I have reviewed in this mission").
- REV2 escalated: B2 — the AM2 exclusion remedy kept a PREFIX shape over a TWO-interval token
  region; M4/M5/M6 green (M6: legal chamber-block relocation exempts the whole stylesheet).
  N9 — repo has TWO TypeScript compilers (root 7.0.2 / apps/ui 5.9.3, nearest-cwd): gates now
  pin invocation directory; reviewer self-corrected its round-0 "layout.tsx CLEAN".
- Verdict REWORK round 2 stands as issued (orchestrator does not re-tier). AM3 dispatched
  21:58 (ADR-001 range-pair contract + ADR-006 cwd pin); RW2 packet pre-drafted with
  AM3-FILL placeholder; then codex resume epoch=4, then REV3.
- Corrected on the record: REV2's restated anonymous-landing hole was already closed by AM2/D.

## 2026-09-01 — Wave 1: T9-C1 shipped (commit 3aefb2d), blind review running
- Attempt 1 preflight-blocked CORRECTLY (verify-command survivability, 4th AF-1-class defect)
  -> ARCH-01-AM5 rewrote all 32 rows under the ownership law (pin ownership follows subject
  ownership; nothing reordered; 5 orphan pins fixed; absence-pin rule; s8 + mount constraints).
  Grok reviewed the AM2-AM5 series: PASS — AMENDMENT SERIES SOUND.
- Round 1 (resumed session, 28 min): all four rows RED->GREEN (5f/54p -> 59/59 worst-of-3);
  pda-s03 migrated per adjudication (5 cases before/after, library assertions byte-preserved
  against session render); DOM order asserted; 12 mutants incl. MOVE/REMOVE/REFORMAT triples
  on both boundary properties, SHA-restored; render suite 18->19 files (83 tests); canonical
  gate 0-new; oracle 0.
- Orchestrator gate re-ran everything + LIVE dev-server proof: cookieless GET / returns the
  hero headline + data-mode-toggle in initial HTML (HTTP 200).
- Fresh Opus blind review dispatched 00:11 against 3aefb2d (REDs reproduced from 3aefb2d^,
  own mutants incl. one against the migration). On PASS -> T3-C1 (serialized on page.tsx).

## 2026-09-01 01:00 — T9-C1 CLOSED: PASS — MERGED-READY
- REV round 1 REWORK (B1: document-wide pin dies at T3-C1's TopBar mount — reviewer M9,
  forward-dated) -> RW1 (f017e12, scoped pins, class swept, N5 corrected) + AM6 in parallel
  (d10b403: premise fixed, two-toggles adjudicated -> T3-C1-4, convention published,
  fail-loud gate). REV2: PASS — reviewer's own M9/M5/M8 all RED, discriminator proven,
  neighbor control clean; two non-blocking findings routed INTO T3-C1 (t_3c8f699b scope
  one-liner, t_5d0c892a real-render premise pin).
- T9 slice state: C3 done, C1 done; C2 (chrome labels/CTAs/return path) and C4 (content)
  and C5 (residual migration bind) remain — C2 is Wave 2.
