# T1 Claude Opus — three-worker A/B artifact correction 2

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router
Kanban: `accounts-phase1` / `t_b225b2f2`
Status: static repair of tool-envelope corruption only; **NO EXECUTION**

## Authority

Continue Claude Opus session `e4f0558b-1204-4ca9-b349-59c8edc79909`.
Read this packet completely. The governing design remains
`T1-claude-3worker-ab-draft-packet.md` SHA-256
`a1cef6fb53a178607db9eb84036c7677d9aa0b8dffbb738b8da1873f4c047503`,
and correction 1 remains the substantive authority. This seat only removes
serialization corruption and repairs the two patch envelopes until the outer
static checks can parse/apply them.

Entry artifact hashes are:

```text
7d0fc09a41951b15ef5c2eb1fee15b4f90a4399a13ade5cc77f7fb8f85186260  T1-3worker-ab-booted-rss-harness.mjs
82df221fcb109407520cf3e460c77fe9b7599e5c42f202d79d78971b33927c70  T1-3worker-ab-adjudicator.mjs
53e2e99c35b54271dfd6484b10ad4f2dc533a12d303a9c49e9003146d4f9f6a1  T1-3worker-ab-command-matrix.md
d495303b234947519a9486e9785efd213912283433ea9b53bedef9fd6164424d  T1-3worker-ab-integration.patch
0e62eddccb3c451bfa14a1fbbdaa194bc780f8ae33031f22d7ec605887836fe2  T1-3worker-ab-architecture.patch
8e4ef8814e94e7c90e07c76dc3327459f66764a05bbdf412f79541033e5f5837  T1-3worker-ab-mutation-helper.mjs
f6656d4ea80e3fb023f59fb447a49a69545204b6acb3a36f8c7ac90f607a7031  T1-3worker-ab-manifest-builder.mjs
4995dc993d919084fad54fb6049ffd030145d1a7bcb7e89a2ee0177742fa1a25  run-claude-T1-3worker-ab-diagnostic.sh
```

Required HEAD is
`9801f85d97e4263a7c8311304e29d6a03c4a6d15`; index empty; all twelve
governed hashes remain those in the design packet.

## Exact failures to repair

Outer checks—not the Claude seat—reported:

```text
HARNESS=0
ADJUDICATOR=0
mutation-helper:159 SyntaxError Unexpected token '<' at </content>
manifest-builder:782 SyntaxError Unexpected token '<' at </content>
diagnostic-wrapper:732 zsh parse error near newline; trailing </content>
integration.patch: corrupt patch at line 676; trailing </content> and </invoke>
architecture.patch: corrupt patch at line 577; trailing </content>
```

You may edit only these five artifacts:

1. `T1-3worker-ab-mutation-helper.mjs`
2. `T1-3worker-ab-manifest-builder.mjs`
3. `run-claude-T1-3worker-ab-diagnostic.sh`
4. `T1-3worker-ab-integration.patch`
5. `T1-3worker-ab-architecture.patch`

Remove every literal tool-envelope artifact (`<content>`, `</content>`,
`<invoke>`, `</invoke>` and variants) from those files. Preserve the intended
source. For both unified patches, inspect every hunk header and adjust its old/
new line counts to the actual hunk body so the patch is syntactically complete
and applies only to its frozen governed test. Do not weaken or delete a test,
anchor, assertion or correction-1 requirement merely to make the patch parse.

Claude has no Bash tool. Use only `Read`, `Edit`, `Write`, `Glob` and `Grep`.
Do not run Node, zsh, Git, a test, patch, harness, adjudicator, builder, worker,
PostgreSQL or any command. Do not edit the other three artifacts, product,
tests, packets, receipts or quarantined paths. Do not stage/commit/push or move
Kanban. The outer wrapper runs `node --check`, `zsh -n` and both
`git apply --check` commands after the seat exits.

Return exactly:

`T1 THREE-WORKER A/B CORRECTION 2 READY FOR STATIC CHECK`

Do not claim Sol/V/launch/product approval or Kanban Done.
