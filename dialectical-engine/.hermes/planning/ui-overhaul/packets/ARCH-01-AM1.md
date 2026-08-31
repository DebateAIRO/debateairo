# ARCH MICRO-AMENDMENT 1 — scope the ADR-001 sweep (AF-1)

You are the ARCH-01 seat resumed. The wave-0 coder BLOCKED at preflight with a
genuine defect in your ADR-001: the sweep command scans apps/ui/{app,lib,components}
globally, but T9-C3's write surface is 4 product files — it measured 47
residual colour literals across 12 files owned by later clusters, so the
zero-residual acceptance is unsatisfiable without violating one-writer-per-file.
Its report is on t_4ccac5c4 (comment 19:25).

## Amend (your files; SPECs stay untouched)
1. ADR-001: replace the single global sweep with:
   a. WAVE-0 ORACLE — the same rg pattern scoped to T9-C3's write surface
      (apps/ui/app/globals.css apps/ui/app/layout.tsx
       apps/ui/components/ModeToggle.tsx apps/ui/lib/debatePresentation.ts)
      → residual 0 required of T9-C3. Keep the globals.css :root exclusion.
   b. PER-CLUSTER ORACLE — each re-skin cluster's acceptance inherits
      "scoped sweep over its own write surface → 0 after its work"; append the
      enumeration: the 47 current residuals grouped by owning cluster (12
      files), so every member has exactly one owner. Use the coder's measured
      list on the ticket, re-measure yourself, quote the command.
   c. MISSION-FINAL ORACLE — the original global sweep → 0, owned by the LAST
      cluster in dispatch order (name it) and repeated as a QA line for V.
2. dispatch-order.md: correct the Wave-0 row's acceptance sentence accordingly.
3. T9/PLAN.md T9-C3 rows: same correction (PLAN is yours).
4. DECISIONS: append the amendment row with WHY (AN2 tally-footer style: state
   the row count). Fold in AN2/AN3 while you are in the files: add the
   DECISIONS tally footers and publish the 10 unpublished contrast rows in
   token-inventory.md (tickets t_5c747457).

## Freeze + handoff
Final comment on t_09a09884: opens SKILLS LOADED (already-loaded set is fine to
restate), then `AMENDMENT 1 LANDED — AF-1 + AN2 + AN3` and the re-measured
counts. That comment is your LAST write. Self-report: append a one-paragraph
amendment note to your existing report BEFORE the comment.
