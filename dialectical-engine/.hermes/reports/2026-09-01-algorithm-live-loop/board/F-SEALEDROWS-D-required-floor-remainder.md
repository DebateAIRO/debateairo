# [claude@opus-5] F-SEALEDROWS-D · the required floor stops one file short of the settings field

```yaml
state:
  ticket: F-SEALEDROWS-D
  risk_tier: medium          # the demonstrated defect is closed; this closes the type-level remainder
  status: done # CLOSED in rework 2 and merged at d08ee928 — the member is required on the one remaining type; the alias is deleted
  owner: { agent: claude, session: tbd }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [codex static review]
    human_review: no
  worktree: { path: tbd, branch: tbd, merge_status: merged@d08ee928 }
  authority_epoch: 1
  rework_round: 2
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sealedrows-rework1-2026-09-04
```

Filed by the lane/sealedrows seat closing codex B2, and disclosed by it rather than left for a
reviewer to find.

**What IS closed, verified by the orchestrator running the probe:** deleting
`wayOfKnowingCeiling.emptyBasisFloor` from the real acceptance rows now produces a zod
`invalid_type` at exactly that path. Codex's demonstrated defect —
`acceptance-parser-accepts-missing-floor true` — no longer reproduces. Both strict deployment
schemas require the member; both policies publish `SealedBandCeilingRegisterRow`.

**What remains.** Making the member required on `BandCeilingRegisterRow` itself breaks two
out-of-contract test files. Pushing it to `deriveBandCeiling`'s input instead leaves exactly ONE
out-of-contract error: `apps/runner/src/index.ts`, which both declares the settings field and
makes the call. The seat versioned the boundary and documented it in place rather than relaxing
anything.

Three files close it. This is the type-level tail of the same optional-shared-settings class that
produced F-S11-6, F-T17-T9 and B2 — worth closing together with F-T17-T9, which is the same
disease in the same settings object.
