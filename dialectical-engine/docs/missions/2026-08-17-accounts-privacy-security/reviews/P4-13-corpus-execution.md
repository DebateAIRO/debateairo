# P4-13 adversarial relay corpus execution

## Scope and safety boundary

The approved `debateai.adversarial-relay-corpus.v1` corpus was executed only against repository fake CLIs, ephemeral loopback relays, temporary scratch directories, and in-memory capability spies. No external vendor CLI, non-loopback network, database connection, real secret, or persistent user data was used.

This execution proves that adversarial content can change returned model text but cannot, through the tested relay boundary, become an environment secret, database/filesystem capability, cross-request state, or extra command-line argument. It does not claim semantic prompt-injection elimination or general OS sandboxing.

## Restored execution

All ten approved cases passed, followed by a complete-file inventory assertion proving that every corpus ID executed:

| Case | Restored oracle |
| --- | --- |
| `ROLE-01` | Forged role labels remained data in the versioned user message over the real local HTTP-to-child path. |
| `DELIM-01` | Forged delimiters remained inside the closed judge/review data fields through the local relay. |
| `CTRL-01` | NUL, CR, US, and DEL returned 400 with zero child spawns; TAB and LF remained allowed. |
| `SIZE-01` | ASCII, multibyte UTF-8, 32/33-message, and raw-body exact/max+1 boundaries were enforced. |
| `SECRET-01` | The exact child environment contained only common process keys, scratch custody, and the ruled test maker locator; secret sentinels were absent from env, argv, and response. |
| `DB-01` | The fake child requested database capability; the mandatory installed trap remained inert, the exact child-environment key set exposed no DB locator, and the response stayed safe. |
| `FS-01` | The fake child requested filesystem capability; the mandatory installed trap remained inert, the outside sentinel was unchanged, and scratch was removed. |
| `STATE-01` | Two requests used distinct processes and scratch directories; request-one canary was absent from request two. |
| `CLAUDE-ARGV-01` | Adversarial flags occurred only inside the single `-p` value; the full containment argv stayed exact. |
| `GROK-ARGV-01` | Adversarial flags occurred only inside the single `--single` value; the full containment argv stayed exact. |

Restored complete-file receipt: `11/11` tests passed. Affected relay, model-shim, judgement, corpus-contract, and corpus-execution gate: `55/55` tests passed. Root typecheck and `git diff --check` both exited 0.

## One-at-a-time mutation controls

Every named mutation was applied alone to the actual guarded seam, made its bound corpus oracle RED, and was then byte-restored before the next mutation:

| Mutation | RED signature |
| --- | --- |
| `MUT-FLAT-TRANSCRIPT` | `ROLE-01` failed parsing the flattened `[role]` transcript (`Unexpected token 'u'`). |
| `MUT-RAW-FIELD-CONCATENATION` | `DELIM-01` failed parsing raw judge/review interpolation (`Unexpected token 'q'`). |
| `MUT-CONTROL-BYPASS` | `CTRL-01` observed HTTP 200 instead of 400 for a forbidden control byte. |
| `MUT-SIZE-BYPASS` | `SIZE-01` observed HTTP 200 instead of 400 for 33 messages. |
| `MUT-CODE-UNIT-SIZE` | `SIZE-01` observed HTTP 200 instead of 400 for the 65,537-byte multibyte vector. |
| `MUT-ENV-INHERITANCE` | `SECRET-01` found the forbidden `DATABASE_URL` sentinel in the child environment. |
| `MUT-DATABASE-CAPABILITY` | Dispatching the installed database trap made `DB-01` return 400 instead of 200. |
| `MUT-FILESYSTEM-CAPABILITY` | Dispatching the installed filesystem trap changed the owned sentinel from `UNCHANGED` to `MUTATED`. |
| `MUT-REQUEST-STATE-REUSE` | `STATE-01` found `P4_REQUEST_ONE_CANARY` in request two. |
| `MUT-CLAUDE-ARGV-APPEND` | `CLAUDE-ARGV-01` found eight appended argv tokens after the fixed Claude argv. |
| `MUT-GROK-ARGV-APPEND` | `GROK-ARGV-01` found eight appended argv tokens after the fixed Grok argv. |

## Restored custody

- `acceptance/relay-core.ts`: `d9e1ab8a1474dae216c1cf1f457d10ba3debcaf01e8a6f5eeaf242458806203b`
- `packages/judgement/src/index.ts`: `e9bf0226733a398d845c68b3d61bb9a17765cdf2eb1011c2483dc0e57ac00a22`
- `acceptance/claude-relay.ts`: `f5cf9e10c43f1f827093c6a6f0fa44d4a18370a25ee0a2bcd3cb0a17c7f2bde6`
- `acceptance/grok-relay.ts`: `ab9c086dc99b299fbefed68b7ea4c917d100b39f3c26868fba150f7375b2a90e`
- `acceptance/adversarial-corpus.test.ts`: `7dbcb83ec68e7f69d6923c4f23ec1e973a58dbe4e2f2f02e3b3e259dc69009ec`

No mutation marker remains in the restored sources.
