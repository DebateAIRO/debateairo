# ATTEST evidence

- Ticket: `t_956edf50`
- Integrator session: `/root/requirements`
- Separate reviewer: `/root/plan_review`
- Input revision: `fa362c5e87abe0e6068cb8f43822d718697258f5`
- Scoped commit: `252f8faf46d987e1df89778eff0439ea140994d0`

The reviewer-authored `EDITORIAL-attestation.json` was copied byte-for-byte to `packages/support-kb/reviews/manifest.json`. Both files have SHA-256 `02b1396b131ddf437dc361679ecbad6587d1fafda3a2a17b889ec370492f5fab`.

Before the copy, all 24 article hashes in the reviewer record were recomputed from the worktree and matched 24/24. The catalog attestation digest is `24784328a4bb8d4e5205b3036dd369268180df792243db1c296a0a7ed2a0f9fe`, matching the separately reviewed canonical catalog.

Loading the exact content with the copied record produced:

- `kbVersion=b6f48a593b500f108e0eed11e0ceccfe8654e684fcdf0bb8284c1ded179867ca`
- `shippedCount=18`
- `ignoredCount=0`
- `previewReviewedCount=12`
- `ownerRatifiedCount=6`
- `reviewRecords=24`

The focused C1 suite passed 4 files and 52 tests. Log: `.hermes/reports/support-conversation-20260914/logs/ATTEST-c1-final.log`. The preceding 51-test frame predates the focused real-manifest assertion and is retained as `.hermes/reports/support-conversation-20260914/logs/ATTEST-c1.log`.

The 24 peer-reviewed draft entries retain blank owner-ratification fields. This integration neither authors editorial metadata nor converts peer review into owner acceptance. Visitor-facing content has no reviewer/evidence metadata added. Forgot password remains unresolved, and CP1 remains open.
