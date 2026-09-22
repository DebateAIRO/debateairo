# [unassigned] F20 · two acceptance tests would pass while testing an EMPTY SET after the version bump (seat-internal id "F12"; renumbered — board F12 is packet-path defects)

Source: T16 r2 report. After the acceptance register version mint, two acceptance tests
would have continued passing while their queried row set silently became empty — a
green-on-nothing hazard the seat detected during B1's fixture work. Disposition per the
seat's own filing (fixed in-lane if inside the register surface; otherwise this ticket
carries it to V at closure). Codex r2 verifies which of the two dispositions actually
happened; the judge confirms at lane close.
status: done · cured in-lane inside T16's B1 historical fixtures (codex r2 "B1 CLOSED" verifies the fixtures assert seeded-version row sets and historical snapshots — the empty-set path is now RED-guarded); judge confirmed at T16 close · created 2026-09-01
