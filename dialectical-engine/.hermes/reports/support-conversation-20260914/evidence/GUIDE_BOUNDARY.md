# GUIDE_BOUNDARY evidence

- Node/ticket/session: `GUIDE_BOUNDARY` / `t_e2631117` / `/root/requirements`
- Base: `163f15c59bcfb1bf2cb0979f8b0e7d414ebd0703`
- Product commit: `714c7aa9f649b3e1bff4c517cb69b7245f68d9a3`
- Scope: PG-1 public-only Support boundary plus the authorized `DebatePageGate.tsx` caller amendment.

## Result

Support messages now accept exactly `{text}`, use the stored session language, and expose only public product guidance. Language selection invalidates the active browser capability before the next message. Live consent, debate attachment, private-run projection, ownership SQL, private tool, ports, routes, UI controls, and model payload fields were removed. Actual private-record requests receive fixed EN/RO `REFUSE_ZONE` responses with no model/private-port call. Injection and credential/safety refusals retain precedence when a request also names private records. Human-case, encryption, rate, spend, snapshot, and shredding behavior remains connected; the nullable legacy consent column and historical outcome values remain for compatibility.

## Verification

- START sandbox: `GUIDE_BOUNDARY-start-existing.log`, environment failure `listen EPERM 127.0.0.1`.
- Executable START: `GUIDE_BOUNDARY-start-existing-escalated.log`, 4 measured scoped failures at base (S7 route inventory, widget key dispatch, two architecture assertions). These are START observations, not attributed inherited defects.
- Meaningful RED: `GUIDE_BOUNDARY-red.log`, 11 expected contract failures plus the absent new module.
- Security precedence RED/GREEN: `GUIDE_BOUNDARY-security-red.log` proves mixed injection/private intent incorrectly returned `REFUSE_ZONE`; `GUIDE_BOUNDARY-security-green.log` proves `REFUSE_INJECTION`, zero model calls, and an immutable injection event after the correction.
- Final current-byte focused command: `pnpm exec vitest run tests/render/sup-01-help.test.tsx tests/render/sup-03-consent.test.tsx tests/render/sup-04-widget.test.tsx tests/unit/support-public-guide-boundary.test.ts tests/integration/support-own-context.test.ts tests/integration/support-routes.test.ts tests/architecture/sup-01-boundary.test.ts tests/architecture/sup-03-projection.test.ts tests/unit/s7-authorization.test.ts tests/integration/support-shred.test.ts --maxWorkers=1`.
- Final focused result: `GUIDE_BOUNDARY-green-final2.log`, 10 files, 269 passed, 1 todo, 0 failed, rc 0.
- `git diff --check`: rc 0 before commit. Worktree clean after commit.

Class sweeps cover EN/RO private-record retrieval/list/summary/inspection versus public menu-location questions. Route spies prove no model work for private requests, and the mixed-intent regression proves the existing injection lock path wins. Static tests prove the private module, repository, SQL, route, port, tool, caller prop, and UI controls are absent while case and operational ports remain.

## Isolated support evaluation: explicitly not GREEN

Exact final command: `pnpm run support:eval`. `GUIDE_BOUNDARY-eval-current-final.log` records 50/60 in each of three deterministic runs. Classes B, C, D, E, F, and G all pass; class E is 6/6 with fixed public-boundary refusals and no private/model tool calls. The ten failures are exactly `SUP-A-01` through `SUP-A-05` and `SUP-A-11` through `SUP-A-15`, each with `outcome,required_sources`.

No baseline attribution is claimed for those ten failures. The smallest reproduction is `pnpm exec tsx tests/support-eval/run.ts --runs=1`; it produces the same ten IDs. The final PG-1 harness intentionally remains article-only/legacy-answer (`loadHelpCorpus(content)` and no `requireStructuredDraft`), while production loads the reviewed manifest plus recovery components with `requireReviewedRecovery:true` and uses strict structured drafts. The preserved investigation frames are:

- `GUIDE_BOUNDARY-eval.log`: sandbox tsx IPC `EPERM`.
- `GUIDE_BOUNDARY-eval-escalated.log`: 0/60 execution failures.
- `GUIDE_BOUNDARY-eval-diagnostic2.log`: safe fixed-category diagnosis, message status 409 from omitted `knowledge.snapshot`.
- `GUIDE_BOUNDARY-eval-current.log`: intermediate 50/60 after restoring immutable snapshot lookup.
- `GUIDE_BOUNDARY-eval-final2.log` and `GUIDE_BOUNDARY-eval-sources-current.log`: bounded production-reviewed/strict harness probes; they change unrelated class outcomes and are diagnostic variants, not the final harness contract.
- `GUIDE_BOUNDARY-eval-current-final.log`: exact committed-byte result and authoritative PG-1 eval evidence.

The remaining A discrepancy needs separate correctness review. No retrieval/KB/content change was made in PG-1.

## Corpus custody and limits

The knowledge bytes are unchanged from START: `packages/support-kb/recovery/components.json` SHA-256 `8934293e862387fd3e6e83527780640e8497bdc50704854e43eb1d2db24fcae6`, 31,857 bytes; `packages/support-kb/reviews/manifest.json` SHA-256 `8e0057f4091d5cae733ddafd92527d1f02144834a78a8724c37cc99672ca3951`, 38,174 bytes. No KB, menu content, model, live preview, provider, credential, or checkpoint-acceptance action occurred. Final composition, separate correctness/security review, retrieval discrepancy disposition, and owner acceptance remain external gates.

## Skills loaded

- heartbeat-worker: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-worker/SKILL.md`, SHA-256 `2cc1cb1676e582648002989f75259127421a223bbea1e47814f52366a9ca94c1`.
- test-driven-development: `/Users/vladmihaimiron/.codex/plugins/cache/openai-curated-remote/superpowers/6.3.0/skills/test-driven-development/SKILL.md`, SHA-256 `bf1b8216e523851a411e91d429a7c1c2a173e79d88957bc78e348218d50edd54`.
- systematic-debugging: `/Users/vladmihaimiron/.codex/plugins/cache/openai-curated-remote/superpowers/6.3.0/skills/systematic-debugging/SKILL.md`, SHA-256 `808fc5717aa88ad65efff312b11c186294d3e6ee301afb584e2f86599b137787`.
- verification-before-completion: `/Users/vladmihaimiron/.codex/plugins/cache/openai-curated-remote/superpowers/6.3.0/skills/verification-before-completion/SKILL.md`, SHA-256 `2befe7fc55bcadaa3d97dd9e8efeb633d2561c0ebe74c5a8b17c4d9e7e4520b3`.
