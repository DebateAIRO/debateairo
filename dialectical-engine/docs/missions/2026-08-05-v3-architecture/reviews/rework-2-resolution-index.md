# Rework round 2 — author's per-finding resolution index (ARCH-V3-R1 / C2)

Author: c2-author (Opus 5), same session. Plan.md now 1737 lines, 92 AC rows,
new §2.5a + S0 serve trace + run frozen-head/event-stream split. Disputed: none.
Counts: digest set 56 = R 15 / D 17 / V 24; grand total 67 = R 20 / D 18 / V 29;
28 distinct V questions; AQ set reduced to 3 (AQ-4 withdrawn as duplicate).

C-3: Seam C split into H2-a (byte-identical build inputs except the one register row) + H2-b (third-provider change confined to packages/providers).
C-6: run frozen head gains tier_source + tier_provenance_ref; three-supplier round-trip fixture; schema assigns authority to no one.
C-10: canonical DDL = NOT NULL + trimmed-length CHECK (coalesce equivalent given); NULL-passes-CHECK reason written out; fixtures insert through the migrated DB.
C-11: all FKs graph-scoped via run_id composites; UNIQUE(run_id, edge_id, polarity) and UNIQUE(run_id, node_id); cross-run rejection fixtures incl. cross-run undercut.
C-12≡O-27: eviction rebuilt in 4 clauses — conformance record never written after sealing; append-only segment_suppression projection; derived per-segment join; eviction → components-only + DEFECT (ruled two-state surface); byte-identity fixture.
C-13≡O-30/O-35: full S0 serve trace with all four AC-52 gates + DR-057 verdict-R9 pass + named AC-53 terminal (two conformance failures); conformance EXHAUSTIVE at S0 so AM-1 not pulled in; AM-1 row re-labelled (S5 sampling / S0 if narrower).
C-14: two named predicates — deployment_maker_capability (launch+admission) vs run_maker_reachability (per-run, DR-014 transient path) — plus standing-misconfiguration counter; S8 fixtures restated.
C-15: AQ-4 withdrawn (labelled non-blocking note); counts propagated (67 total / 28 distinct).
C-16: §7 doc 1 spine rescoped AC-01..92; AC-86..92 must resolve to owner/carrier/fixture in 09-traceability.md.
O-23: VR-3 operator-independence limb restored (read-only-credentialed separately-scheduled job); second attestation artifact; S1 + S15.
O-24: shared packages/published-arithmetic (agg/σ/product, zero deps) imported by both propagation and apps/replay; §2.5a records why duplication would violate AC-14/AC-85; σ >-vs->= breaking scenario; literature vectors + tie-boundary CI. No exemption, no V-QUESTION — VR-3's ruled text licenses it.
O-25: tier 2 = structured conformance_record; raw_text of EVERY model call (incl. conformance judge) tier 3; no-raw-text-in-tier-2 fixture.
O-26: run split — immutable frozen head (UPDATE revoked) + append-only run_progress_event; run_row_activation likewise event-streamed.
O-28: A-1 question extended — asks V whether UNDERCUT_TRANSMISSION becomes a third ruled OD-06 producer or the effect is carried outside edge.strength; member declared NOT WRITABLE until V grants.
O-29: consumer-manifest.json emitted by the fenced interface build; orphan-audit consumes it as required release input; §2.2 rationale narrowed.
O-31: battery/decision dependency row (kernel only); no-impure-import extended; structural rule 5 (materialise→compute→persist + replay-hash failure mode); purity gate in §7 doc 7.
O-32: AC-11 predicate truncated (scheduled-under-running-job); no-raw-artifact clause moved to failure condition.
O-33: AC-24 rests on charter VR-2 alone; manifest §4.2h demoted to context; AQ-1 widened (second obligation vs DR-044 restatement).
O-34: affected_node_ids deleted; condition_mark_node the single store.
O-36: spine AC-01..92; nine core / four supporting / five shared; C6 two-limb form.
O-37: NULLS FIRST on kind declared; order-stability property test across two derivations.
O-38: AQ-3 reduced to genuine two-way; fenced-package option annotated as failing FLAG-4(b)'s test; structural rule 4 scope stated (code coupling only; clean-room = checkout separation + manifest §14 roles).
