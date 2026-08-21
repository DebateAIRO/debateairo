# Codex review — PRE-03

Ticket: `t_a888ab35` / PRE-03  
Lens: Codex, independent read-only review of Claude-authored artifacts  
Comments read through: `1786046220` — `READY FOR PEER REVIEW`  
Evidence boundary: ticket body, authorization/orchestrator notes, and handoff only. No later ticket comments and no Grok verdict or `reviews/pre-03-grok*` artifact were read.

## Verdict

Changes requested. The core register and test-strategy fold-in is substantially correct, but active prose still contradicts DR-069 and DR-074, and two PRE-01-owned slice assignments are presented as settled rather than provisional.

## Findings

1. **DR-069 is contradicted by active NOT-FENCED architecture and CI statements.** `00-overview.md:203` calls the deployment “one fenced interface” even though the diagram immediately says NOT FENCED. The same active model persists at `00-overview.md:376` (“the fenced interface consumes it”), `00-overview.md:708` (`fenced web` plus the obsolete consumer-manifest acceptance input), and `00-overview.md:747` (AC-81 carried by checkout separation). `06-test-strategy.md:924` and `:950` likewise still define typecheck/structural rules around “the fenced interface.” These are not historical quotations: they describe the current container, constraint spine, CI, and dependency law. Replace them with the plain in-repo kept package and intra-repo type-graph mechanism already stated elsewhere under DR-069.

2. **The overview’s constraint spine restores the DR-074 path that the fold-in deletes.** `00-overview.md:656` still defines AC-22 as “no declaration ⇒ withheld parent.” That directly conflicts with the ruled serve walk at `00-overview.md:529`, `05-register-skeleton.md` §2.3, and DR-074: the mandatory deployment row eliminates the undeclared/declare-once/withhold chain tail. Reword the AC-22 spine row to the parent → run → mandatory-deployment resolution rule, with supplying level recorded and no source literal.

3. **`FX-LG-17` / `FX-LG-18` slice ownership is presented as final while PRE-01 still owns the reconciliation.** `06-test-strategy.md` §12 says any slice assignment obtained from PRE-01 reconciliation will explicitly say “reconciled per `07` §5.1 (PRE-01),” as `FX-SRV-16` does. But the minted rows in §9.10, the S7/S12/S14 rows in §12, and the summary in §15 state S7/S14 and S7/S12 without that provisional dependency. The worker handoff itself says these were inferred and need confirmation when PRE-01 lands. Record that dependency honestly and defer to `07-build-order.md`; do not make PRE-03 the authority for those assignments.

## Independent verification

- Register inventory counted directly from the Markdown tables: §5.1 = 19 entries with one dissolved/non-shipped row, §5.2 = 6, §5.3 = 9, §5.4 = 26. Shipped arithmetic is `18 + 6 + 9 + 26 = 59`; the §5.4 delta is `23 - 1 + 1 + 3 = 26`, so `56 → 59` is correct.
- `scoringOperator` is present, deployment-mandatory, non-blank after ratification, and currently `— none stated`; old chain steps 4–5 are explicitly deleted. DR-078’s “low / medium / high” tier list plus “register carries the per-tier values” supports three per-tier rows; all three are present and valueless. The verdict-first flag is absent and its deliberate deletion is recorded. A5.2 count 7 and the mandatory orderingPolicy owner/trigger/sign-off triple are stated. REG-8 remains UNRATIFIED, loud on read, assigned to VG-02, with neither shape selected.
- P-D2 uses DR-074’s exact replacement: resolution from parent/run/deployment register rows, never a source literal. `FX-SRV-13` has the three required limbs: independent firing after all three blocking gates pass; cap-and-serve with visible label; never block/add a terminal.
- All five minted ids have slices and scoped negative discipline: `FX-WIRE-02` refuses an over-limit request and forbids read-side writes; `FX-WIRE-03` explicitly does not claim authentication strength; `FX-ORPH-07` is non-blocking; `FX-LG-17` changes no served number; `FX-LG-18` never fires for an incomplete debate. The §15 roster expands to 129 ids, and all 129 occur in §12 after expanding its ranges.
- The overview’s serve walk states four gates plus the non-terminal cap, and its five terminal routes are tied to A-01 / DR-099. The central container diagram itself is NOT FENCED; finding 1 concerns the contradictory active prose around it.
- `08-open-questions-for-V.md` contains 28 Q headings and 30 RULED blocks. The complete mapping is DR-068 through DR-097 with exactly the two required doubles: Q-08 = DR-075 + DR-076 and Q-14 = DR-082 + DR-086. Spot checks of Q-02, Q-03, Q-08, Q-10, Q-14, Q-20, Q-25, and Q-28 match the ledger’s rulings and conditions; the historical question bodies remain below the inserted annotations.
- `grep -R -n 'CONDITIONAL' docs/architecture` returned zero hits.
- Every newly minted register row carries `— none stated`; no threshold, cap value, tolerance, or mapping content was invented.

CODEX REVIEW: CHANGES REQUESTED — 1. Remove active fenced-interface/consumer-manifest/checkout-separation claims contradicted by DR-069; 2. Remove the stale AC-22 no-declaration-to-withheld-parent rule contradicted by DR-074; 3. Mark FX-LG-17/18 slice assignments provisional and subordinate to PRE-01/07 rather than settling them in PRE-03.

## Re-review — rev 3.1

Comments read through: `1786047526` — `READY FOR PEER REVIEW (rev 3.1)`  
Evidence boundary: prior Codex review, the requested rework/rev-3/rev-3.1 handoffs, and direct inspection of the landed architecture files. No `reviews/pre-03-grok*` artifact was opened.

## Verdict

Approved. Rev 3 and rev 3.1 resolve all three Codex findings without weakening the surviving constraints, and the two routed mechanical repairs are correct.

## Verification

1. **DR-069 is now consistent at every previously named active site.** `00-overview.md`'s container introduction says the kept interface is in the same repository with **no fence**; context 17 describes ordinary in-repo consumption; AC-59 uses the in-repo web package and intra-repo static type-graph pass; and AC-81 carries the role split while explicitly removing checkout separation as an enforcement barrier. `06-test-strategy.md` §14 likewise describes one in-repo typecheck graph, and structural rule 4 is code coupling rather than a clean-room reading barrier. The over-correction guard is accurate: DR-069 removes the UI checkout barrier and consumer-manifest mechanism, but the build-checkable import restrictions under AC-09, AC-48, VR-3, AC-59, and AC-17 remain distinct and live. The remaining `08-open-questions-for-V.md` Q-02 fence/consumer-manifest language is inside the preserved historical question and priced alternatives, immediately subordinated to the `RULED — DR-069` annotation; it is not current architecture.

2. **DR-074's dead chain tail is not restored.** The AC-22 spine row now states parent → run → mandatory, non-blank deployment resolution, records the supplying level, and forbids a source literal. It expressly deletes the former no-declaration → withheld-parent route while preserving AC-26: strict-and still has no identity element, so an unjudged conjunct remains a live producer of `WITHHELD(reason)`. Direct searches for `no declaration` and `withheld` across the four PRE-03 files found only the explicit deletion/history, the surviving AC-26/served-state semantics, unrelated verdict suppression language, and preserved ruled-question history—no active restoration of the deleted declaration-chain tail.

3. **FX-LG-17/18 are provisional and correctly subordinated everywhere.** Their §9.10 fixture rows, §12 S7/S12/S14 entries, and §15 minted-id rows all mark slice placement provisional under `07-build-order.md` §3.3. The division of labour is explicit: `07` owns which slice owes ruling-created work; `06` owns the fixture id and assertion. The landed `07` agrees exactly: DR-076 is S7 spawn + S14 UI, and DR-089 is S12 watch + S7 WAIT drain.

4. **Rev 3.1's two repairs are sound.** `06-test-strategy.md` §12 quotes the old ambiguous matrix-A sentence only to mark it **SUPERSEDED and carrying no force**, points to `07` §5.1 as the operative tie-break, and its adjacent ownership paragraph agrees that `07` owns scheduling while `06` owns roster existence/id/assertion. `05-register-skeleton.md` §2.4 now has a four-cell `Shape | Row(s) | Rule | Citation` header and matching separator over the unchanged three four-cell data rows.

## Mechanical checks

- Repository-wide `docs/architecture` search: zero `CONDITIONAL` hits.
- `05-register-skeleton.md` §5.4 main register table: exactly 26 data rows.
- The documented arithmetic remains intact: §5.4 `23 − 1 + 1 + 3 = 26`; total `56 → 59`.

CODEX REVIEW (rev 3.1): APPROVED
