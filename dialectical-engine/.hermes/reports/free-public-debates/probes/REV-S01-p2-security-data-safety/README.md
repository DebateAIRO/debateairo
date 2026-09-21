# REV-S01-p2-security-data-safety — promoted probes

Written against slice head **`c358d494`**. Re-derived from the pass-1 probes
(`../REV-S01-p1-security-data-safety/`), which were written against `db4758da`.

## One command

```bash
WORKTREE=<repo root> ./run.sh          # or: ./run.sh <repo root>
```

No file is mutated. `run.sh` copies the two probe files into `<root>/tests/`, runs each one
as a single quoted vitest target, and removes the copies on exit via a `trap`. Logs land in
`logs/`, or in `$PROBE_LOG_DIR`.

## Expected frames at `c358d494` — all PASS means the code is HEALTHY

| file | pair | what it decides |
|---|---|---|
| `rev-s01-p2-sec-refix.test.ts` | 9/0 | D1 EXECUTE + `search_path` over every function 0069/0070 create or replace · D2 no product role writes either event table · D3/D3b S-N1 both halves · D4 S-N2 · D5 S-N3 · D6 S-N4 · D7 the `ensure_…` admission (recorded, not asserted) · D8 the erasure completion's reach |
| `rev-s01-p2-sec-oracle.test.ts` | 3/0 | E1 `GET /v1/answers/{id}` byte-identity for a non-owner and an anonymous caller · E2 neither answer-serving route publishes for a caller who does not own the run · E3 a throwing publish hook leaves both 200 bodies byte-identical |

## Mutation, and the direction of a RED

There is **no file or migration mutant here.** The only object this probe creates is a
test-only SECURITY DEFINER inserter, `public.rev_p2_insert_visibility`, built inside the
probe's own ephemeral embedded-Postgres database in `beforeAll`. It exists to separate two
layers that a bare insert conflates: pass 1 measured that **no product role holds INSERT on
`core.run_visibility_event`**, so an insert under `SET ROLE` always stops at `42501` and never
reaches the trigger. The inserter runs as the owner and is executed by the product role, so
the SQLSTATE it reports is the **trigger's own** decision.

**D3b, D4 and D5 are the pass-1 characterisations INVERTED.** At `db4758da` the same inputs
were admitted (`A5` hit a foreign key before the trigger decided; `A6` printed `NO_ERROR` and
took the wrong run PRIVATE). At this head each must raise
`55000 PUBLICATION_V2_REF_BINDING_REQUIRED`, and each case carries a **control** — the same
shape with the boundness, the live lease or the matching run restored — which must still be
`NO_ERROR`. A green D3b/D4/D5 without its control passing would mean the admission was broken
rather than tightened, so read the pair, never the single line.

**D7 records, it does not assert.** `core.ensure_free_public_auto_publish_work` (0070:45-77)
admits an unbound run; whether that is reachable is decided in
`docs/missions/free-public-debates/reviews/REV-S01-p2-security-data-safety.md`, not here. If a
later head adds a boundness check, D7's printed line changes and no assertion moves — update
the artifact, not the probe.

## Fixture notes that cost this seat time

- `core.run` is append-only: `core.reject_mutation()` raises `55000` on `UPDATE core.run`. An
  unbound run must be **seeded** unbound; you cannot flip `plan_tier` after the fact.
- `serve.publication_snapshot` has a check constraint on `content_ciphertext`: build a real
  envelope with `PublicationCipher`, not a hand-written JSON object.
- `MemoryPublicationKeyStore.store` refuses a second `create()` for the same `publication_ref`;
  cache the envelope per ref if you present it twice.
- `identity.session.token_hash` is unique: derive it from the session id, not a literal.
