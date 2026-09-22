# REQ evidence — support-conversation-20260914

Node `REQ`, pass 1/3, ticket `t_7a8d2d0e`, session `/root/requirements`, authority epoch 1. Requirements source base: `446c685e977104ecf2b0b5ee0519f7123968429f`. Clean attributed implementation freeze supplied by BASE: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`, baseline 432/432.

## Inputs and current findings

- Owner authority: `docs/missions/support-conversation-20260914/OWNER-REQUEST.md:1-114`, `INSTRUCTIONS.md:1-15`, and `00-intake.md:1-39` authorize implementation, preserve the existing Support design, restrict execution to CP1, require server-enforced credential safety, and leave Forgot password destination unresolved.
- Approved plan read: `docs/superpowers/plans/2026-09-14-support-agent-conversation.md:1-226`. Product map read: `docs/superpowers/research/2026-09-14-support-agent-product-map.md:1-125`.
- Current loader evidence: `packages/support-kb/src/index.ts:8-21` defines status and ratification fields; `:313-342` includes only complete `shipped` + `ratifiedBy=V` pairs and hashes selected file bytes.
- Current answer evidence: `apps/api/src/support/answer.ts:25-38` hard-codes intent signals; `:80-98` makes them an eligibility gate; `:223-247` accepts a non-empty model string, stores it, and returns a separately held variable.
- Current cipher evidence: `apps/api/src/support/session.ts:161-174` declares `write` returning `SupportMessagePlaintextRecord`; `:224+` performs canonical redaction/encryption.
- Current navigation evidence: `apps/api/src/support/tools.ts:8-20` and `apps/ui/components/support/Assistant.tsx:137-144` maintain separate partial allow-lists. `Assistant.tsx:49-55,407-550` accepts scalar text/one link and renders escaped text.
- Current recovery evidence: `apps/api/src/recovery.ts:9+` provides backend recovery-start behavior, while the targeted current UI search found only saved MFA recovery and no verifiable Forgot password entry. Per FIND and owner correction, this is an unresolved location, not feature absence.
- Current scope measurements: 11 page routes in the approved product map; 12 current bilingual topics in 24 content files; 157 dirty entries at REQ claim. No pre-existing dirty path was edited by this node.
- Preview dependency: standard `dev:auth:up` binds UI 3001, API 8790 and providers 8791–8796, all already occupied. Free ports observed by FIND are not a coherent supported configuration. CP1 therefore depends on a separately owned disjoint-port stack change and forbids stopping/reusing current listeners.

## Requirements result

- CP1: 21 numbered functional requirements and 11 acceptance criteria covering complete catalog disposition, real editorial provenance, immutable snapshots, current-turn retrieval, deterministic recovery intent, strict response policy, canonical persistence/HTTP identity, existing UI actions and supported disjoint preview.
- CP2: 15 numbered functional requirements and 8 acceptance criteria. It remains specification-only until explicit CP1 acceptance.
- CP3: 14 numbered functional requirements and 6 acceptance criteria. It remains specification-only until explicit CP2 acceptance.
- CP1 plan: three sequential product clusters, one parallel exact-byte editorial review/attestation gate, one separately routed preview-infrastructure prerequisite, explicit shared-file ownership, direct trace from requirements to suites, and captured three-run commands.
- Open acceptance blockers: exact Forgot password URL/opener; reviewed disjoint-port stack configuration. Independent CP1 catalog, draft content, navigation safety and response-boundary work is executable.

## Verification performed

No tests, build, typecheck, provider call or stack start was run; this node held no heavy-command lease. Verification was light and documentary:

```text
wc -l CP1/SPEC.md CP1/PLAN.md CP1/DECISIONS.md CP1/DONE.md CP2/SPEC.md CP3/SPEC.md agent-reports/REQ.md
69 + 173 + 20 + 32 + 42 + 39 + 46 = 421 lines
```

```text
rg -n '\b(TODO|TBD|FIXME|improve|better|robust|appropriate|handle)\b' <six checkpoint artifacts>
0 matches after replacing one non-criterion use of "appropriate"
```

```text
git status --short -- <allowed REQ artifact paths>
only new packet-authorized CP1/CP2/CP3 and REQ report paths; CP1/PROGRESS.md was not edited
```

## SHA256 receipt

```text
a4567fbcc88234ff0c1dae74f367e6c01a13b906b8c49b699af1b2ea02c866db  docs/missions/support-conversation-20260914/slices/CP1/SPEC.md
21f1f4ef580e68105cd0d6924f4d15ef59bb8c47654724f8e85e12708fa6415e  docs/missions/support-conversation-20260914/slices/CP1/PLAN.md
d6ad36c67069fd95f824f6fc6eb4fd89ac3f1c3cdf2e9fc34764134dfa512ed4  docs/missions/support-conversation-20260914/slices/CP1/DECISIONS.md
618350ec7d364070efc404cdf82f1fef24a5d94e1aa99526338cc82740174fee  docs/missions/support-conversation-20260914/slices/CP1/DONE.md
5656ed6bc290a255a2f846397a2575b616a0829b3cad8ae465cac9bfa152296a  docs/missions/support-conversation-20260914/slices/CP2/SPEC.md
ff9ffea163ebe2a68256caf254b44a759c42000b865c9d8a9b6ad1ed5cc6fc4e  docs/missions/support-conversation-20260914/slices/CP3/SPEC.md
d4032389021c59be1cda1f0194820a8ec01e581c6f299e4283c42594ab9025e1  .hermes/reports/support-conversation-20260914/agent-reports/REQ.md
```

The evidence report's own SHA256 is recorded in the board/handoff receipt because a file cannot contain its own stable digest.

## UNVERIFIED

- Forgot password destination and destination-specific automated/manual checks.
- Supported disjoint-port local preview and manual walkthrough.
- All future implementation suites, typecheck/build and runtime behavior.
- Editorial accuracy of new EN/RO bytes; this specification requires a separate exact-byte Sol editorial review before preview inclusion.
- Actual agent token usage and exact wall-clock duration are unavailable from this harness.
