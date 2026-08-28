# P4-13 Grok 4.6 review packet

## Review scope

Review only Kanban card `t_c4949a6f`, **P4-13 · Execute the approved adversarial relay corpus locally**.

Ticket-owned files:

- `acceptance/adversarial-corpus.test.ts`
- `docs/missions/2026-08-17-accounts-privacy-security/reviews/P4-13-corpus-execution.md`

Design dependency (read-only):

- `docs/missions/2026-08-17-accounts-privacy-security/P4-12-adversarial-relay-corpus.json`
- `tests/architecture/p4-adversarial-corpus-spec.test.ts`

The existing relay, Claude/Grok adapter, and judgement sources are in scope only to verify the executed oracles and restored mutation custody.

## Required outcome

- Execute every approved corpus case using repository fake CLIs, ephemeral loopback relays, temporary scratch directories, and in-memory spies only.
- Prove forged roles/delimiters remain untrusted content; forbidden control/size inputs deny before spawn; child environment is allowlisted; fake database/filesystem requests remain inert; requests do not share process/scratch/model state; and Claude/Grok adversarial flags remain one prompt argument.
- Exercise every named P4-12 mutation one at a time against the actual guarded seam, capture a non-vacuous RED, restore exact bytes, and finish GREEN.
- Make no semantic prompt-injection-elimination, external-vendor, real-database, general-filesystem-sandbox, or general OS-sandbox claim.

## Execution summary

The complete restored corpus passes `11/11`: ten case tests plus an inventory assertion that all approved IDs executed in the complete-file run. The affected relay/model/judgement/architecture gate passes `55/55`.

The local observation child reports its exact pid, cwd, argv, allowlisted environment, versioned prompt, and any requested fake capabilities. The trusted adapter requires the matching capability trap to be installed whenever the child requests database or filesystem capability, then intentionally does not dispatch it. Database execution would hit a throwing trap. Filesystem execution would change the test-owned outside-scratch sentinel, so its unchanged bytes are the live oracle. `SECRET-01` pins the complete child environment after excluding only macOS's injected `__CF_USER_TEXT_ENCODING`; `DB-01` pins the exact common-environment key set. The state case proves distinct pid/cwd and no request-one canary in request two.

The Claude and Grok cases invoke the repository fake CLIs through their real relay adapters and compare the full argv, proving the adversarial flag text occurs only in the single prompt value.

## Mutation evidence

All eleven P4-12 mutation controls were RED and exact-restored:

1. flattened transcript → `ROLE-01` parse failure;
2. raw judge/review field concatenation → `DELIM-01` parse failure;
3. control validator bypass → forbidden input returned 200;
4. count limit 32→33 → 33 messages returned 200;
5. UTF-16 code-unit sizing → 65,537 UTF-8 bytes returned 200;
6. inherited parent environment → secret sentinel reached child env;
7. database capability dispatch → mandatory throwing trap changed HTTP 200 to 400;
8. filesystem capability dispatch → mandatory trap changed the owned sentinel to `MUTATED`;
9. retained request state → request-one canary appeared in request two;
10. tokenized prompt append to Claude argv → exact argv mismatch;
11. tokenized prompt append to Grok argv → exact argv mismatch.

The detailed RED signatures and restored custody are in `P4-13-corpus-execution.md`.

## Gates and custody

- complete corpus: `11/11` GREEN;
- affected relay/model/judgement/corpus gate: `55/55` GREEN;
- root `pnpm run typecheck`: exit 0;
- `git diff --check`: exit 0.

SHA-256:

- corpus spec: `6bdd6e00dbe2bdc54074ce1ce9168e0296d92d65bfb99fff36411fc7d7782b57`
- corpus execution test: `7dbcb83ec68e7f69d6923c4f23ec1e973a58dbe4e2f2f02e3b3e259dc69009ec`
- corpus architecture test: `80b69a1028d79a61a75b2a5207faf46c032f0a55bdcfab2d58a8c1ad76a0c8d8`
- execution record: `68f7c6af0079ac11e0267c65742d6a0b7a294147c2157860d99eeed7025d2b7f`
- restored relay core: `d9e1ab8a1474dae216c1cf1f457d10ba3debcaf01e8a6f5eeaf242458806203b`
- restored judgement: `e9bf0226733a398d845c68b3d61bb9a17765cdf2eb1011c2483dc0e57ac00a22`
- restored Claude adapter: `f5cf9e10c43f1f827093c6a6f0fa44d4a18370a25ee0a2bcd3cb0a17c7f2bde6`
- restored Grok adapter: `ab9c086dc99b299fbefed68b7ea4c917d100b39f3c26868fba150f7375b2a90e`

## Requested verdict

Inspect the scoped files and return exactly one of:

- `GREENLIGHT` if P4-13 is complete with no bounded-scope P0/P1 issue; or
- `BLOCK` with concrete file/line evidence, the invalid/vacuous oracle or omitted attack path, and the smallest required repair.
