# SOURCE_SERIALIZATION — bounded Git diff fingerprint comparison

**Result: NO_MATCH**

Node: `SOURCE_SERIALIZATION`  
Ticket: `t_851668bc`  
Session: `/root/forgot_destination`  
Source root: `/Users/vladmihaimiron/Documents/DebateAIRO`  
Source HEAD: `446c685e977104ecf2b0b5ee0519f7123968429f`

## Exact bounded result

The retained intake default-binary fingerprint is `606ad70f5e8b852724469816ca922d5685a4117668daeeed1a4d740b8988035e`. One finite run hashed the current inert binary diff with the default abbreviation and every explicit `--abbrev=N` for integer `N=4..40`. No explicit variant and no control reproduced the intake fingerprint.

- current default binary SHA256: `dc9f0caa2b77b167ee9d4d779464f95f84494a362043eec1d48c2256622c1813`
- current working binary full-index SHA256: `0a5e7ab820d02a74ea8ece4215371aa9d4e3b7cbd162fdf045e45b597d098f8b`
- current cached binary full-index SHA256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (empty)
- explicit variants measured: 37
- variants equal to intake: none
- `--abbrev=8`: equals the later/current default fingerprint `dc9f0caa…c1813`
- `--abbrev=40`: equals the current forward full-index fingerprint `0a5e7ab8…98f8b`
- Git: `git version 2.50.1 (Apple Git-155)`
- read-only `core.abbrev`: `UNSET`

The complete 37-row matrix, exact argv for every row and control, and equality booleans are bound in `SOURCE_SERIALIZATION-receipt.json`. Raw diff bytes were held only in process memory for hashing and were neither printed nor persisted.

## Commands represented

Every Git invocation used `--no-optional-locks`. Diff commands also used `--no-ext-diff --no-textconv`.

```text
git --no-optional-locks diff --no-ext-diff --no-textconv --binary
git --no-optional-locks diff --no-ext-diff --no-textconv --binary --abbrev=N  # N=4..40
git --no-optional-locks diff --no-ext-diff --no-textconv --binary --full-index
git --no-optional-locks diff --no-ext-diff --no-textconv --cached --binary --full-index
```

## Before/after custody

| Measurement | Before | After | Equal |
|---|---|---|---|
| source HEAD | `446c685e977104ecf2b0b5ee0519f7123968429f` | `446c685e977104ecf2b0b5ee0519f7123968429f` | true |
| cached binary full-index SHA256 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | same | true |
| working binary full-index SHA256 | `0a5e7ab820d02a74ea8ece4215371aa9d4e3b7cbd162fdf045e45b597d098f8b` | same | true |
| tracked dirty path count | 56 | 56 | true |

The run therefore preserved current source HEAD, staged state, tracked-path set count, and full-index working serialization. No source, index, ref, config, attribute, product, or runtime mutation was performed.

## Interpretation and limits

This result rules out one bounded explanation: the current patch serialized by the current Git with a fixed object-ID abbreviation between 4 and 40 does not produce the saved intake hash. It does not prove that underlying source bytes changed historically. Intake did not retain the raw diff, Git version/configuration, full-index fingerprint, or all 56 per-file hashes, so other historical representation inputs cannot be separated from a byte change.

The retained observation window still says only that the intake fingerprint last appeared at `FREEZE-LIVE2` on 2026-09-14 at 14:04:30Z and the later default fingerprint first appeared at `FREEZE-FIX3` at 14:30:38Z. It does not prove the change time, cause, or actor. Untracked files are outside `git diff` and no intake untracked inventory was retained.

This node does not close or downgrade `SOURCE_CUSTODY` ticket `t_e582c85f`. Final REV3_P3 owns that disposition. Product-lane changes by concurrent ATTEST are independent and were not inspected. No source restoration, semantic audit, test, model, preview, browser, HTTP, provider, or product operation occurred.
