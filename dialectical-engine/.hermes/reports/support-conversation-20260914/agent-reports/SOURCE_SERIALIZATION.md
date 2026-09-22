# SOURCE_SERIALIZATION self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause and price

The historical custody question cannot be closed from the retained evidence because intake preserved one SHA256 of a default `git diff --binary` serialization, but not the raw diff, Git version, `core.abbrev`, full-index control, or a complete per-file inventory. The one legal hypothesis was that identical current patch bytes serialized with a different object-ID abbreviation. A fixed matrix of all 37 widths from 4 through 40 disproved that bounded hypothesis: none reproduced the intake hash.

The check cost one 1.82-second helper run, 37 explicit variants, and three controls. It did not consume a heavy lease, run tests, inspect source semantics, or touch product/runtime state. The price of the missing intake controls is that a negative comparison still cannot prove an underlying historical file-byte change, cause, actor, or exact time. That uncertainty survives into final REV3_P3.

## What nearly went wrong

- `--abbrev=8` exactly reproduces the later default hash. I nearly treated that equality as an explanation for the intake mismatch, but the intake hash is different and no width matches it.
- `--abbrev=40` exactly reproduces the current full-index hash. That is a useful control, not evidence about the historical intake command.
- The source HEAD, staged-empty hash, 56 tracked-path count, and full-index working hash remained identical before and after. I kept this as current-run custody only and did not turn it into an intake-wide preservation claim.
- The prior report names a 14:04–14:30 window from receipts. It narrows when serialized hashes were observed; it does not identify an actor or prove when underlying bytes changed.

## Dead ends to preserve

- Do not try more abbreviation widths: 4 through 40 exhausts the fixed SHA-1 display-width range requested by the packet.
- Do not inspect or save raw diff bytes. The original raw bytes are absent, so a new raw capture cannot reconstruct them.
- Do not vary diff algorithms, attributes, text conversion, external diff, locale, Git versions, or repository configuration adaptively. Those were outside the finite contract and would create explanations rather than test a retained one.
- Do not restore or normalize the dirty source. That would destroy the current custody evidence and unrelated user work.
- Do not infer from the absence of an abbreviation match that file bytes definitely changed. Serialization inputs other than abbreviation were not retained at intake.

## Upgrade and one-prompt-machine improvement

Every intake should capture a four-item source fingerprint bundle in one machine-readable receipt: Git version and relevant read-only config, default binary diff hash, full-index binary diff hash, and a sorted per-file content-hash inventory for every tracked dirty path. Capture the empty staged hash and tracked-path count beside it. Then each administrative freeze can compare the same bundle and identify whether a difference is representation-only or file-byte-level without another provenance node.

The packet was precise and appropriately bounded. The only small ambiguity was whether “index” meant the staged binary diff hash or the index tree object; the named cached binary full-index measurement resolved it. Actual usage is UNAVAILABLE.
