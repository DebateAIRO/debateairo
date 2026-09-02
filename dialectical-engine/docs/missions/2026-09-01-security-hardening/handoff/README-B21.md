# B21 handoff — encrypt the verdict text in `serve.answer` for encrypted runs (L5-F2, HIGH)

Self-contained patch series for the live mission's orchestrator. It is **not**
merged into the security branch; fold it into the branch that owns
`packages/serve/src/index.ts`.

| Item | Value |
| --- | --- |
| Base commit | `b5a6b6eb` (origin/dev, `docs(observability): add supplier requirements packet`) |
| Branch | `security/handoff-b21-serve-answer` (worktree `.worktrees/security-handoff-b21`) |
| Tip | `40d1e3a36a4193e8d500af198bf1981143fb600c` |
| Patch files | `0001-fix-serve-encrypt-verdict-text-in-serve.answer-for-e.patch` (this directory) |
| Provisional migration | `migrations/0057_serve_answer_content_carrier.sql` — **number is provisional**, assign the next free slot at fold time |
| Files touched | `migrations/0057_serve_answer_content_carrier.sql` (new), `packages/serve/src/index.ts` (3 regions), `packages/crypto/src/index.ts` (1 array entry), `tests/integration/serve-answer-content-encryption.test.ts` (new), `tests/architecture/s6-content-encryption-contract.test.ts` (+1 `it`) |

## Exact test command (real PostgreSQL; run only on a quiet host)

```sh
cd dialectical-engine
ps -Ao command | grep -E '[c]odex exec|[c]laude -p'   # must print nothing
pnpm exec vitest run tests/integration/serve-answer-content-encryption.test.ts
pnpm exec vitest run tests/architecture/s6-content-encryption-contract.test.ts
pnpm exec vitest run tests/unit/s6-content-encryption.test.ts
pnpm run typecheck
```

Observed on the handoff branch: integration 2/2 in 9.7 s (RED on the untouched
base at the stored-row assertion: the verdict marker appears verbatim in
`SELECT to_jsonb(answer) FROM serve.answer`); architecture 7/7; unit 15/16 (the
one failure, `ZodError` `REGISTER_VERSION` NaN at line 586, is pre-existing and
identical with the change stashed); typecheck only the 8 pre-existing
`tests/unit/s14-ui.test.ts` errors.

## Fold instructions

1. `git am --3way <this-dir>/0001-*.patch` on the target branch (the patch was
   verified to apply with `git am` onto a clean `b5a6b6eb` checkout).
2. Renumber `migrations/0057_serve_answer_content_carrier.sql` to the next free
   number (`git mv`), keep the `_serve_answer_content_carrier.sql` suffix, and
   update the number in the migration header comment. Both tests locate the file
   by that suffix, so nothing else changes. Never edit 0038 / 0040.
3. Resolve `packages/serve/src/index.ts` conflicts against the T9/T11 rewrite by
   re-applying the three regions: (a) `persist` — `answerId` + `answerContent`
   encryption next to `factContent` / `composedContent`, before
   `withWriteTransaction`; (b) the `serve.answer` INSERT — `$1 = answerId`,
   `$8 = sentinel-or-plaintext`, two new trailing columns/params; (c)
   `readAnswerProjection` — select `answer.content_ciphertext AS
   answer_content_ciphertext`, decrypt as the fourth member of the existing
   `Promise.all`, project `answerContent.answerForm`.
4. Re-run the four commands above.

## What the migration does (0038 / 0040 pattern)

* `ALTER TABLE serve.answer ADD COLUMN IF NOT EXISTS content_ciphertext jsonb, content_attestation bytea`.
* `CREATE OR REPLACE core.enforce_content_ciphertext()` — 0038 body verbatim plus
  one `ELSIF` for `serve.answer` (encrypted run ⇒ `answer_form` must be
  `{"ciphertext":true,"v":1}` and `content_ciphertext` an envelope, else
  `CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.answer`; legacy run ⇒ no envelope).
* `CREATE OR REPLACE core.enforce_content_attestation_v2()` — 0040 body verbatim
  plus `WHEN 'serve.answer' THEN row_json->>'answer_id'`.
* Triggers on `serve.answer`: `aaa_enforce_content_attestation_v2`,
  `enforce_content_ciphertext`, `enforce_erasure_barrier` (the barrier function
  is unchanged; its generic branch resolves `run_id` from the row). The
  pre-existing 0000 append-only guard `reject_mutation` on `serve.answer` stays.
* Additive and replay-safe (verified: applied twice on a migrated database).
  No historical tuple is rewritten.

## Decisions the orchestrator must make

1. **Historical rows of encrypted runs** written before this migration keep
   plaintext `answer_form` with NULL carrier columns — the existing legacy
   marking — and stay readable. The migration deliberately does not refuse them
   (a 0040-style `CONTENT_…_FORBIDDEN` preflight would block every existing dev
   database) and cannot encrypt them (no run key in SQL). Options: accept and let
   S10 erasure cover them (the plan's stance), or add a preflight/sweep.
2. **Attestation scope is `answer_id`**, not `answer_id:answer_version`, because
   `answer_version` is allocated inside the write transaction after key material
   has to be prepared (house rule: no key load inside a runtime transaction).
   Two versions of one answer therefore share an attestation scope. Binding the
   version would need the leased-cipher pattern (`prepareLeasedContentEncryptionForRun`
   before the transaction, `encryptAttestedLeasedContentForRun` inside) — a
   larger `persist` change than this handoff was allowed.
3. **`packages/crypto/src/index.ts`** gains `"serve.answer"` in
   `CONTENT_CARRIERS` (the only way to express a carrier; `ContentCarrier` is
   derived from it). `packages/db` is untouched. The drizzle mirror
   `packages/db/src/schema.ts` (`serve.answer`) was **not** given the two new
   columns — the serve write path uses raw SQL, and no test compares the mirror
   to the migrations — decide whether to mirror them there for consistency.
4. **V-6 sibling carriers** (`serve.conformance_record.segment_results`, etc.)
   are out of scope here; the same mechanism applies once V rules.
