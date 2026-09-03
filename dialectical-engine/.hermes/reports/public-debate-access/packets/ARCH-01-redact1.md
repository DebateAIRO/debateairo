# ARCH-01 — REDACTION-CORRECTNESS thread, round 1 of 3

**Ticket:** `t_9e9e04ef` (REDACT-01, BLOCKING). NEW thread — round 1 of its own budget. The
acceptance-command thread is closed and exhausted; this does not touch it.
**Your file:** `docs/missions/public-debate-access/slices/S01/PLAN.md` + `DECISIONS.md`.
SPECs FROZEN. No product code, no test files, no worktrees — the coding seat implements.

Open your handoff with `SKILLS LOADED: <list>`.

## An owner-only value reaches anonymous readers. Reproduced three ways.

A Grok blind lens was asked to **construct** a leak rather than review the redaction. It built
one. The Router reproduced it independently before writing this.

**1. At the producer** — `packages/serve/src/index.ts`, `projectServeEdge`:

    strength.number.provenance_ref: row.provenanceRef
    strength.number.replay_handle:  row.provenanceRef
    provenance_ref:                 row.provenanceRef      // edge level

**The same string, on three fields.** Redacting `replay_handle` alone leaves the identical
secret on the other two.

**2. Through the real publish → `readPublicDebate` path:**

    replay_handle_after:          REDACTED_OWNER_ONLY     <- redaction works
    number_provenance_ref_after:  <the secret>            <- leaks
    edge_provenance_ref_after:    <the secret>            <- leaks
    owner_only_value_reached_anonymous_reader: true

Node arm, separate probe: the original `replay_handle` is absent from the JSON but
**reconstructable** from the published `provenance_ref` via a known prefix.

Both probes are collected at `.hermes/reports/public-debate-access/probes/` — run them.

**3. Why the tests stayed green.** The fixtures never alias the two fields; production always
does. Measured: `provenance_ref` takes `provenance:edge`, `provenance:node`,
`provenance:labeled-number`, `test:S01`, and `replay_handle` shares none of them. The lens's
discrimination test is conclusive — aliasing the edge fixture to the production shape made the
residual test FAIL against current redaction; restoring it made it pass.
**The test passes because the fixture is not production-shaped.**

## The defect is your classification RULE, not this one field

`S01/PLAN.md`'s field table classifies all four `provenance_ref` variants COPIED-AND-FLAGGED:

> descriptive internal pointer; not action-granting by name/function unlike `*_handle` fields,
> but not proven safe — S04 checklist it

That is refuted by measurement: for edges, this field **is** the handle, under a different name.

You wrote spine item 16 yourself: *"searching by NAMED LEAD instead of by RISK CLASS is how the
second and third defects ship."* The table classifies by **name** — `*_handle` dangerous, `*_ref`
descriptive — when the thing that determines risk is **what the producer puts in it**. A field's
name is not evidence about its value.

## What round 1 must produce

1. **Re-derive the field table by VALUE PROVENANCE, not by name.** For every field copied to the
   public envelope, trace it to its producer and record what that producer actually assigns.
   Where two public fields receive the same source value, they are one risk, not two.
2. **Say what the rule IS**, in a sentence a later seat can apply without re-deriving it.
3. **Apply the remedy to the CLASS.** `maker_lineage`, `register_row_key`, `register_version`,
   `register_source_ref` and `NodeReviewSchema.provenance_ref` sit in the same bucket on the same
   reasoning. Trace them the same way and state per field whether it is affected — in the
   artifact, so a reviewer checks your sweep mechanically.
4. **Handle DERIVABILITY, not just presence.** The node arm leaks nothing literally and still
   reconstructs the secret. Redacting a value is insufficient when a known transform recovers it.
5. **N1, non-blocking, fix in the same pass:** specify that residual fixtures must mirror
   `projectServeEdge`'s aliasing and the node prefix arm. A fixture that cannot fail against
   production pins nothing — this is the same "exclusive provenance" failure you named, at the
   DATA level rather than the command level.

## Deliberately not prescribed

Whether the remedy is redact-both, project the whole `LabeledNumber`, or drop the field — that is
yours, chosen by shape. Say why in DECISIONS.md.

## Standing

- Reproduce first: run both probes before changing anything.
- RUN every command you touch; paste one observed result.
- Do not disturb what REV-04 checked and found SOUND: the RED-first wholesale-spread mutant
  (C2-6/7/8 fail, restore passes), the legacy answer-only path (`tree_included`/`nodes`/`edges`
  undefined, not `false`, not fabricated), back-compat on the old shape, `cost_envelope` /
  `tier_provenance_ref` exclusion, and mutations staying `auth: "user"`.
- Say plainly what you could not do.

Return control at `REWORK READY FOR REVIEW` or a genuine blocker.
