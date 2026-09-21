# GUIDE_PROBE_CHECKPOINT_FIX — minimal checkpoint repair

## Result

- Ticket/session: `t_ecc721aa` / `/root/preview`
- Revision: `152eed4da1cd3e66b74d8301159ba76427552409`
- Verdict: `PASS_BOUNDED_CHECKPOINT_REPAIR`
- Original checkpoint child status: `1`
- Fixed checkpoint child status: `0`

The append-only PROBE5 variant preserves BIND15 behavior and imports its unchanged reviewed controls. Its source delta adds the validated evidence-root binding, relocates the controls import, and replaces the inline checkpoint closure with the shared `checkpoint-writer.mjs`. No BIND15 file changed.

## Meaningful regression

The regression extracts and executes the actual inline checkpoint source from the failed BIND15 probe with its real lexical dependency names and stubbed filesystem I/O. The original child exits 1 with `ReferenceError: EVIDENCE_ROOT is not defined`. It then executes the actual checkpoint writer imported by the fixed variant:

- first write uses the validated destination with `{ flag: "wx", mode: 0600 }`;
- subsequent checkpoints update the same destination without exclusive-create options;
- serialized state changes are observed on the update;
- a fixed failure state is persisted on the third checkpoint;
- all three directory and write calls target only the owned stubbed evidence path.

The new probe and regression files pass syntax checks. The unchanged actual argument guard accepts the exact PROBE5 argv and rejects old PROBE2 basename, wrong root, extra argument, and malformed revision.

## Preserved bindings

- Ordered-eight digest: `b6162d665b60a1a35d882e41fa5b0da3259e9cb86bae32ca5d5056d320ad99d4`
- Capture SHA-256: `53dbf7a2df891632de70c83ce3fab60a4deac98005df0015f6393880285e9f0b`
- Controls SHA-256: `20adde062fd0f7f478f8bf235e9c1be3a541f5f9bb2a5d421f1d6921d76397b7`
- Matrix SHA-256: `4e3250313f415b71cea228cc5f3559cf9a2375cb5ca70916ecfbaac32c1a5a2c`
- BIND15 proof SHA-256: `fb25e5bb044db363bc5ea54cf6090082603b3796df3d9d63df15671881da1fd5`
- Retained controls/matrix/adapter: 130 / 54 / 3
- Actual capture namespace: unchanged `GUIDE_LIVE_GUIDE15`

The supplemental contract binds script SHA-256 `67dd1695af2f03f55d2bfbed1fafedabf2b8ec2bd57d3348eb23feb80cb4d8f2` and exact PROBE5 output/log paths. Both remain absent and `executed=false`.

No browser, runtime, HTTP, Support, status, capacity, model, database, product, Git, or service operation occurred. Separate review and a later independently authorized PROBE5 remain mandatory.
