# REQ-01 self-report — Grok requirements (ui-overhaul)

1. **Token sink:** hand-extracting ~13 artboards from the 574-line design text into eight SPECs with V-manual steps — necessary, but a machine-readable screen inventory would cut this seat’s cost sharply.
2. **Packet vs skill conflict:** `heartbeat-requirements` says ARCH fills PLAN; REQ-01 packet orders REQ WHAT-proves clusters. Followed the packet; recorded in T9 DECISIONS so ARCH does not treat PLANs as empty scaffolds.
3. **Near-miss:** almost silently chose redirect-to-login for anonymous `Start a round`. Packet §4 caught it — flagged V-DECISION with proposal (a).
4. **Near-miss:** almost ignored shipped `publicMode` shared workspace when reading TURN 3b. Specced 3b as layout/lock requirements on that path instead of inventing a parallel page.
5. **Dead end avoided:** did not unpack `design-document-original.html`; used rendered + text exports as ordered.
6. **Upgrade:** design exports should ship ids + binding strings so REQ does not re-key artboards.
7. **Upgrade:** QA=V template block (numbered browser steps + expected observations) belongs in the requirements skill floor.
8. **Compass discipline:** INSTRUCTIONS.md is 76 lines by pointer-only TOC; detail lives in slices.
9. **False-fail scrub:** listing banned vague adjectives inside PLAN law text trips mechanical greps — reworded to point at the skill.
10. **Left open on purpose:** vocab, anonymous CTA, placeholders, T3b composition, `dezbatere.ro` — routed, not picked.
11. **Write surface:** `docs/missions/ui-overhaul/**` + this report + kanban comment only; no apps/ edits, no git commit. Pre-existing dirty `web/.../page.tsx` is not this seat’s.
12. **Reviewer ask:** any PLAN step that needs judgement to mark done/not-done is still too soft — file it.
13. **Skeptic rework:** T5 omitted design `REVIEW AGREED BY:` and lacked explicit `tests/render/**` bind — fixed; swept same pin-bind class onto T1/T4. Cost: one rework round that a design-string checklist against each artboard would have prevented.

## Round 1 rework (peer VERDICT: REWORK)

14. **What repeatedly cost tokens:** PLAN acceptance cells written as bare `Assert` while T9 already showed the literal-string form — seven slices needed a full rewrite. Upgrade: REQUIREMENTS floor template must ship a PLAN acceptance cell example with literals + mandatory “Cluster verification command” line (spine item 12) so the first draft cannot omit them.
15. **Vacuous acceptance (F4):** open V-DECISIONs left “expect closed decision” green for any behaviour; “if available/if linked” made steps unfailable. Upgrade: never file an acceptance step that references an open decision — either concrete observation or no step. Fixture preconditions must be required, not optional skips.
16. **Vocabulary OQ held open while binding design marketing strings** — peer correctly failed that. V closed app-vocab-everywhere; translating T9 binding copy + mapping table in DECISIONS was the right close. Upgrade: if SPEC lists “binding strings,” they must match the closed vocab rule in the same version.
17. **Murder-case upgrades for one-prompt machine:** (a) design export → auto checklist of labeled strings/controls per artboard against SPEC inventory; (b) CI grep forbidding bare `| Assert` PLAN cells and missing `Cluster verification command`; (c) freeze artifact at READY FOR PEER REVIEW (F2) so reviewers never race writers; (d) packets must load brainstorming skill path explicitly (F5 floor).
18. **Efficiency:** V rulings in the rework packet saved a second OQ cycle — keep rulings in the same packet as findings. F11 missing `4 TOTAL`/`Read ▾`/`Details ▾` was a checklist miss, not ambiguity.
19. **Write discipline:** finished all SPEC/PLAN/DECISIONS/self-report writes before the final board comment (F2 freeze).
