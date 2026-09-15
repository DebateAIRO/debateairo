# T0 stable-red names CLOSED after the baseline (read by tools/d15-classify.py, D60 ADDENDUM 2)

One row per T0 stable-red name that later went GREEN for a DIAGNOSED reason. The classifier subtracts
these from the stable-red authority so a fixed test stops reporting as VANISHED. A name is added only
with the commit that fixed it and the ticket that diagnosed it — never because it happened to pass.

| closed name (verbatim, as vitest prints it) | fixed at | ticket |
|---|---|---|
| `tests/integration/database.test.ts` > apps/runner — legal command lifecycle > claims, judges through the HTTP gateway, propagates, serves, and settles | 3d137d64 (h-fix merge) | F-H-1 + F-H-2 |
