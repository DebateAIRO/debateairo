# S3c REWORK 3 — re-review packet (ruled-row metadata only; zero implementation change)

Ticket t_86938dd1, board `accounts-phase1`. Author: Codex, session 01a019e7.
ONE of two blind lenses. **Refute, don't rubber-stamp.** READ-ONLY on source;
running tests REQUIRED. Change set from **mtimes**, never `git diff`. Restore any
mutation, confirm byte-identity. No commit, no push. Verdict to
`reviews/S3c-r3-<lens>-verdict.md`.

**This round is metadata and proof only. Two ruled-row numbers.** The limiter
implementation is claimed **byte-identical to rework 2** — verify that first,
because if true, everything both lenses confirmed in r2 carries over untouched and
your job is small. If the implementation moved, that alone is a finding.

## What Codex changed (claims — verify them)

**C1.** Renamed the isolated figure to
`isolated_limiter_resident_measurement.isolated_measurement_ceiling_mib`, so **no
generic "published bound" field can be mistaken for a provisioning number**. The
sole operator-facing field is now
`booted_process_resident_bound.published_provisioning_bound_mib = 384 MiB`.

Measured in one booted real-stack subprocess — embedded PostgreSQL, production
argon2id policy, `PostgresIdentityRepository`, `RegistrationService`,
`FileUserDekStore`, ten durable registrations, exact 100% limiter occupancy:
**138.7 MiB fresh → 161.4 after real traffic → 295.0 at 1 572 864/1 572 864
slots**, `allocatedBytes` fixed at 154 140 672; exact fill sources
3 416 876 / 3 669 727 / 3 434 706. The row **conservatively publishes
max(fresh 295.0, independently-verified 368.7) = 368.7, rounded to 384**.

**C2.** `beyond_threat_curve` now labels and derives exact-binomial values:
**30 154 / 100 580 / 284 843 / 612 417 / 907 684 ppm**.

VR-10: a **one-unit** change to the provisioning bound (384→385) goes RED; a
one-unit change to the 50 000-source curve point (30 154→30 155) goes RED. Gates:
**804 tests / 110 files** in 194 s, typecheck, lint 28/0, `git diff --check`;
`identity.ts`, mail channel, crypto, lockfile and migrations diffs empty.

---

## What to check

1. **Verify the implementation really did not move.** Compare `registration.ts`
   and the integration test against their rework-2 hashes. Codex claims they are
   exactly the r2 values. If so, say so explicitly — it is the reason this review
   is narrow.
2. **Is 384 MiB now honest and unambiguous?** Boot the real stack yourself and
   measure at 100% occupancy. Codex's own fresh measurement was **295.0**; it
   published **384** using the higher independently-verified 368.7 as the peak.
   Confirm your own figure sits under 384. **Over-publishing conservatively is
   acceptable; under-publishing is not** — but check it is not so inflated that it
   is useless guidance either.
3. **Can a reader still arrive at a wrong provisioning number?** Read the whole
   ruled row as an operator would. Is there **exactly one** field that reads as
   "provision this much", and is every other memory figure clearly named as a
   component measurement? The r2 failure was two booleans contradicting a
   `measurement` literal — confirm no comparable contradiction survives anywhere
   in the row, including field names, the schema literals, and `sourceRef`.
4. **Derive the exact-binomial curve independently** and compare all five points.
   Both lenses already re-derived the model for the 12-cell table; apply it here.
   The published values must be the model's, not a draw dressed as one.
5. **Re-derive both one-unit mutants**, and confirm they are not so tight they
   flake — run each repeatedly.
6. **Confirm the frozen set still holds** given the implementation is unchanged:
   spot-check rather than re-run everything — B1's mail/rotation ceiling, route
   isolation, D1 property 2, D3, S3b durability + oracle, VR-3. If the
   implementation hash matches r2, a spot-check is sufficient and you should say
   that is why.
7. Gates reproduce (804 tests / 110 files, lint 28/0). Frozen scope by mtime.
8. **T9 (t_6ff49601) and `pendingMailDispatches` (S3d) are OUT OF SCOPE** — confirm
   untouched; do not re-report either as a finding.

## Verdict
GREENLIGHT or BLOCK + numbered findings with file:line evidence and measured
numbers. If BLOCK, state exactly what proof lifts it. **If this is green, say so
plainly** — the ticket has had three reworks and the remaining question is only
whether these two published numbers are now true.
