# Loop report 20 — PROV-01 (t_779f40b3) · closed 2026-08-13

First ticket closed under the ratified retrospective laws (DR-167..DR-171),
and the set's final ticket.

## What the ticket was
The persisted `tier_source` claimed ASKER for a machine-derived default —
DR-115 at the provenance layer. Fix: `MACHINE_DEFAULT` contract member
(kernel-minted), real form touched-state, admission preservation via
`preserveSubmittedTierSource`, honesty-drawer plain words, migration 0020
row invariant.

## Timeline
- Rev1: Codex session 019ffb0e-551c-7090-be45-58536ec75cfc; diamond split —
  Grok APPROVED, Opus BLOCKING (B1 production clause unproven; B2 DB CHECK
  gap on real PG; A1 render advisory).
- Rev2: same-session resume; directed RED→GREEN on all three; full suite
  534 passed.
- Confirmation (2026-08-13, per P8 finder-confirms-own-finding): the rev1
  Opus finder verified its own findings closed in an isolated APFS clone
  (DR-163). All three CONFIRMED-CLOSED; every handoff number reproduced
  independently; VERDICT: APPROVE. Confirmation wall-clock ~13 min,
  ~121k tokens, 58 tool uses.

## Findings counts
- Rev1 diamond: 2 blocking + 1 advisory (Opus); 0 blocking (Grok).
- Confirmation: 0 blocking; 2 new advisories (A5: composition-root guard is
  a string pin, not behavioural coverage; A6: DB refusal probes use bare
  rejects.toThrow — causality carried by mutations/server log). Both are
  carry-forward hygiene under the standing scope rule.
- Beyond-handoff check: migration 0020 applied cleanly over a POPULATED
  legacy DB (0000–0019 + real rows) — a case no prior review had run.

## Mutation ledger (P1, re-run at confirmation)
M3 production clause → red (s09 architecture test); M4 revert 0020 → red;
M4b drop raised-arm assertion → lowered arm still red (both directions
carried by the CHECK); M5/M5b drawer label/line → red. All md5-restored,
full recursive diff clean.

## New-law firsts logged this close
- DR-169 applied: ticket moved straight to done on dual greenlight.
- DR-163 isolation held: zero writes to the real tree except the verdict.
- P7 applied: this report written at close, not remembered later.

## Incidental discovery during the same window
The stack restart that preceded this close surfaced BUG-01
(JUDGE_SCHEMA_FAILURE terminal-fails a run on first schema-slip despite the
DR-159 retry-tolerant envelope) — routed through DR-171 architecture
consult; tracked separately.

## Board after close
All coding-set tickets DONE. S15 parked by V. BUG-01 pending its authorized
plan.
