# Slice map (fixed by orchestrator — REQ-01 fills content, never reshapes)
Slices mirror the dependency waves. Ticket ids = goal task ids (stable citation keys).

| slice dir | goal tasks | goal-prompt.md line ranges (v4, sha 78238eeb…) |
|---|---|---|
| slices/S00-baseline | T0 | 69–79 |
| slices/S01-register | T16 | 80–96 |
| slices/S02-hygiene | T1, T2, T4, T8 | 97–128 |
| slices/S03-panel | T3 | 129–143 |
| slices/S04-edges | T5, T6 | 144–168 |
| slices/S05-stopping | T7 | 169–186 |
| slices/S06-selection-label | T10, T11 | 187–221 |
| slices/S07-synthesis | T9 | 222–270 |
| slices/S08-band-form | T12, T13 | 271–283 |
| slices/S09-envelope | T17 | 284–295 |
| slices/S10-production | T14 | 296–308 |
| slices/S11-eval-harness | T15 | 309–320 |
| slices/S12-closure | Global DoD + confirm-items + δ/ε refit | 28–66 |

Each slice dir gets: SPEC.md (verbatim task text + DoD, quoted from the goal, line-cited),
PLAN.md (lane skeleton: RED evidence → GREEN → suites passed/total → codex review → judge),
PROGRESS.md (empty skeleton; orchestrator is sole writer after creation),
DECISIONS.md (pointer lines into the mission DECISIONS.md — never duplicated rulings).
Global sections of the goal (Scope law 22–26, Global DoD 28–41, confirm-items 42–66,
Non-goals 321–332) are quoted once in INSTRUCTIONS.md or S12, cited everywhere else.
