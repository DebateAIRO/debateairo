# [T3C, accepted] F37 · the shipped entry point never passes `stoppingPolicy` — merged code refuses every multi-maker run
Source: T3C's merge round. VERIFIED INDEPENDENTLY by the orchestrator at integration 44836ecf:
apps/runner/src/main.ts passes judgementPolicy, runDeathPolicy and verdictLabelPolicy and never
stoppingPolicy, and dev-runner-policy.ts contains zero references to it. T7 landed the reader,
the claim-time multi-maker gate and the acceptance composition, but not the shipped one, so a
correctly sealed deployment refuses EVERY multi-maker work item with ADAPTIVE_STOPPING_UNRESOLVED.
T7's suites pass because they hand-build settings (tests/integration/database.test.ts:165); only
a lane driving the shipped entry point can see it. Third instance of the class T3C exists to
close (F33 panelPolicy, F34 claimTimeProbe, F37 stoppingPolicy).
IMPACT: the closing flagship run is M≥2, so this blocks the Global DoD outright.
DISPOSITION (J27): the pass-through fix stays in T3C, isolated in its own commit; and because
D28's enumeration duty is now overdue at the third instance, T3C also adds the CLASS gate.
status: done · escalation_target: v_packet if the class gate cannot be built in-lane

## 2026-09-16 continuation
Moved `working (T3C)` → `done` by RECORDS(CONT-T19). Citation: `PROGRESS.md:53` — T3C merged at
integration `19bbb4c4`, *"F37 stoppingPolicy wiring and the J27 class gate are all in"*. The class gate
the escalation clause worried about WAS built in-lane, so the escalation never fired. STRENGTH: entailed.
