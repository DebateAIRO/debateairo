# Self-report — Hermes ARCH-01

1. Mission: `model-evaluator`; seat: ARCHITECTURE loop owner-author, elected Hermes and reviewed next by Grok.
2. I read the goal packet first, then followed its mandated order: approved Requirements, final REQ-02a architecture notes, wayfinder map and all 11 tickets, then the named schema, migrations, settlement, provider, API discovery, and runner sources.
3. I authored `docs/missions/2026-08-14-model-evaluator/architecture/Architecture.md` as a docs-only architecture proposal; no SQL in it was applied.
4. The architecture selects `packages/evaluator`, a separate evaluator worker composition root, asynchronous terminal-run harvest, and narrow API/runner/settlement/provider/UI seams.
5. It selects FR-3.5 Option E exclusively, with evaluator-owned `domain_id` and `step` columns and a dedicated append-only `evaluator.question_domain` landing; `memory.question_key` is not used for domains.
6. It preserves Q59 and settlement ownership: consensus/process/add-on rows land in `evaluator.observation`, while a real accepted settlement may be linked by a cross-schema FK with explicit REFERENCES authority.
7. The migration specification covers domain, admission, question link, pipeline receipts, observations, supersession, add-on maker guard, profile cells, ranks, token usage, normalized cost, shadow decisions, vLLM probe/catalog, append-only consumer selection/output, indexes, triggers, and role grants.
8. It pins the evaluator local identities to `provider:evaluator-vllm` and `maker:evaluator-local-vllm`, uses a purpose-specific register row, and refuses collision with `configuredProviderSet`; evaluator health never enters `core.provider_probe`.
9. It closes configuration-shaped dark-launch influence with a mandatory healthy-versus-absent differential test over panel membership, `agent_count`, envelope basis, author makers, and review makers.
10. It chooses deterministic scheduler/worker harvest with zero model calls, then a separately sampled, bounded, allowlist-blinded add-on pass protected by its own DB same-maker trigger.
11. Collection and dispatch binding are separate. Dispatch defaults to `UNBOUND`; no metric, scheduler, API, or dev-menu control can bind it, and no live runner selector call site is added in this mission.
12. OQ12 is resolved by folding all FR-0.6 work into ticket/lane 02. The PROGRAMMING merge order is `02 → {03,08} → 04 → 05 → 06 → 07 → {09,10} → 11`.
13. I authored `.hermes/reports/2026-08-14-model-evaluator/mission-graph.svg` with gate, nodes, edges, routers, tiers, lane/worktree labels, HITL and FR-8.0 blocker, numbered merge order, and the lane-plan packet row.
14. Verification: `xmllint --noout` passed; the SVG was rendered in a browser and visually checked for clipping/overlap; a read-only independent audit confirmed substantive coverage and graph completeness, then I repaired its SQL-role/sequence and observation-supersession findings.
15. Constraints honored: only the required Markdown, SVG, and this report were created/edited; no product code, migration file, ticket/board, commit, push, or API-key material was touched.
16. Token basis: exact per-session token usage is not exposed here, so this report marks usage unmetered and does not estimate it.
