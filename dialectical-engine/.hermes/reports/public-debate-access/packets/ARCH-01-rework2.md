# ARCH-01 — REWORK ROUND 2 of max 3

**This is round 2. One round remains.** Round 4 does not exist: if round 3 does not close this,
it goes to a V DECISIONS PACKET row instead. Spend this round on the CLASS, not the instance.

Your handoff OPENS with `SKILLS LOADED: <list>` (you complied last round — keep it).

## What you got right, so you do not undo it

Your round-1 enumeration is good work and is not the defect. You found the class yourself and
said so in the artifact — `S01/PLAN.md:418` calls `stranger_restatement` *"the SAME
open-ended-bag risk class as `disagreement` below"*, and `:421` records `disagreement` as an
*"untyped bag, zero schema-level guarantee"*. You also caught a third `replay_handle` site the
reviewer never named. Keep all of it.

## B2 — BLOCKING. Ticket `t_9322ae7b`. The TREATMENT is the defect, not the enumeration.

You marked both bags **COPIED-AND-FLAGGED** — copied into the public envelope with a checklist
note. **A checklist row does not close a wildcard on a copied path.** Proven twice:

Reviewer's probe against your planned helper:
```
passthrough extras survived? {'check_status':'PASS','secret_extra':'LEAK-ME','owner_note':'do-not-publish'}
JSON contains LEAK-ME? True
```
Router's reproduction: `{...node}` spread survived extras `True`; projection to
`{check_status}` only → `False`. And the same for the open record: a spread carries
`disagreement`'s contents through, `True`.

`redactNodeForPublic` does `...node` (`S01/PLAN.md:486`) and special-cases only
`abstention.ledger_unknown_ref`. Everything else rides through by construction.

## The class, and every member of it — sweep all of them this round

**Class: open-ended bags reachable from `NodeSchema`/`EdgeSchema` on the copied path.** A shape
whose keys are not fixed defeats field-by-field review *by construction*; no enumeration can
ever close it, because the leak is the shape, not a key.

| Member | Shape | Current treatment | Required |
|---|---|---|---|
| `stranger_restatement` | `z.object({check_status}).passthrough()` (`index.ts:453`) | COPIED-AND-FLAGGED | project to `{ check_status }` ONLY |
| `disagreement` | `z.record(z.string(), z.unknown()).nullable()` (`index.ts:456`) | COPIED-AND-FLAGGED | **decide explicitly**: project to named keys, redact wholesale, or justify copying with evidence about what can actually appear in it. The reviewer's fix does NOT touch this one — that is why it is here. |
| `locator` | `string \| null` | COPIED-AND-FLAGGED, S04 3c, UNVERIFIED | resolve: you recorded you could not verify whether it can hold an internal-only path. Verify it or redact it; UNVERIFIED is not a shipping state for a public field. |
| `defeater_refs` | `string[]` | COPIED-AND-FLAGGED, S04 3e, "presumed intra-tree" | confirm the presumption or redact. "Presumed" is not evidence. |

**Sweep for any member I have not listed.** I checked `passthrough()`, `catchall(`, and
`z.record(` in the contract; do not trust that as complete — index signatures, `z.any()`,
`z.unknown()` and `.and()` intersections can all widen a shape. State per member what you found
and what you did about it.

## Required tests — RED before GREEN

One residual test **per bag**, injecting an unexpected key into that bag and asserting it is
absent from the published JSON. Not one test for the class — one per member, so a future
regression names which bag reopened. Each named as its step's acceptance test.

## Bounds

SPECs stay FROZEN. `PLAN.md` edits and `DECISIONS.md` APPENDS only — never edit a DECISIONS
line, append a superseding one citing `t_9322ae7b`. No product code, no tests, no `PROGRESS.md`.
V's four rulings stand and are unchanged: Row 1 reads-not-mutations · Row 2 disclosed
answer-only · Row 4 `cost_envelope` + `tier_provenance_ref` EXCLUDED · Row 5 lane plan approved.

## Handoff

`SKILLS LOADED: <list>`, then `REWORK READY FOR REVIEW` on `t_f864a84b`, stating per class
member what you did and naming its residual test. Append to your self-report: the cause of
treating a wildcard as closeable by a checklist entry — you had already NAMED the risk class
correctly, so the gap was between naming a risk and neutralising it, which is worth writing
down precisely. Then stop.
