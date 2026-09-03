# ARCH-01-AM9 — three calls from the T9-C2 review (ticket t_6c169645)

Same ARCH seat (session bb69b040). T9-C2 PASSED; three of its N-findings are yours alone.

## 0. Read
This packet; the verdict on the closed t_3c187757 (03:41) — N3, N4, N6; ADR-004 in full
(its Decision and Wiring sections disagree); T9-S1; LoginFlow.tsx:115.

## 1. Charges
(1) **N3 — ratify or drop:** LandingChrome ships `Log in` → /login and `Sign up` → /sign-up,
now pinned by tests, but T9-S1 does not enumerate them. Decide: ratify into the row 4 cell
inventory (with a V-visible note in DECISIONS as an appended row — un-ratified copy became
contractual) or order them dropped (name the owning round). Your grounds: the artboard and
the app-vocabulary ruling.
(2) **N4 — reconcile ADR-004 with itself:** its Decision says the sign-up link from login
carries `next` forward; its Wiring section omits it and every downstream artifact copied the
Wiring half; LoginFlow:115's `Create one` link drops `next` (measured round-trip loss).
Amend the ADR so ONE half is normative, publish the cell for the fix (LoginFlow is T9-C2's
file — a two-line change; name the round that carries it, e.g. fold into the open N1
addendum's session as a second charge or a standalone QUICK), and state the MFA boundary
still holds (T8 R3).
(3) **N6 — the declared kind admits `..` and `.` refs** (measured: /public/debate/.. and
/public/debate/. accepted; same-origin post-auth landing on non-debate routes). YOUR call
per the declared-kind law: tighten the kind in ADR-004 (and PLAN-quoted regex becomes
superseded-in-row per AM7 practice) or ratify the acceptance with the rationale written
down. The reviewer's instruction stands: a worker must not "fix" this unratified.
Run/paste anything you publish (your rule); AM5 invariant re-run if any cell changes.

## 2. Bounds
Writes: architecture/ADR-004-auth-return-path.md, dispatch-order.md,
slices/T9/DECISIONS.md (append only), "AM9" append to agent-reports/ARCH-01-claude.md,
board comments on t_6c169645. No product, no tests, no git.

## 3. Handoff
Final comment on t_6c169645 (LAST write, freeze law): `AMENDMENT COMPLETE: AM9` + the three
decisions with grounds + any cells verbatim + `SKILLS LOADED:` + `comments read through:`.
Return control at that handoff; keep the session resumable.
