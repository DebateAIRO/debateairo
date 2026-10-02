# Owned WebAuthn source maintenance

Status: reference custody and proposed static engineering inventory only. No source is accepted for runtime use. Root reviews the proposed symbol-level map and accepts any later adaptation. `reference/` remains immutable evidence; `SOURCE-INVENTORY.json` records imports, external dependencies, narrow candidates and excluded paths. Every acquired file retains its provenance/hash in `reference/SOURCE-MANIFEST.json`, and all five original MIT license files remain intact.

Exact source pins:

| Source | Version | Commit |
| --- | --- | --- |
| SimpleWebAuthn server | 14.0.2 | `545d566cfd521b11287d67a03ea9592dc6e3acec` |
| SimpleWebAuthn browser | 14.0.0 | `83f87addc67b652ff5b84e681669451648216ef6` |
| Tiny-CBOR | 0.2.11 | `3dfd6c890abf450966fc0349dd2ebb94a30144bb` |

The proposed owned contract uses native browser `navigator.credentials.create/get` and Node built-in cryptography. It permits only `attestation:none`, ES256/P-256 and RS256, one exact origin/RP ID, required UP/UV, BE/BS false and bounded 32 KiB input. Individual field/decoded aggregate/CBOR work limits and extension behavior must be settled before implementation. Server base64, ASN.1, certificate/CRL/metadata/network services, trust stores, PQC/other algorithms, upstream barrels and automatic refresh/update paths are excluded or replaced. The small source pieces identified in the map require adaptation; none is a copy-ready whole-file closure.

For each future update:

1. Choose an exact source commit and version explicitly. Acquire into a new immutable reference directory, preserve original licenses, and record source URL, commit, archive hash, per-file hashes and any published-artifact correspondence. Review upstream changes affecting retained code and relevant security advisories.
2. Compare exact old/new source and our maintained adaptation separately. Record every copied symbol/origin/hash, intentional divergence and native replacement; preserve copyright/license notices with adapted source. Recompute the complete local/runtime/type/external import inventory and remove excluded paths from the owned runtime closure.
3. Independently verify the adapted diff and record test commands/results against the exact local version. Obtain root acceptance of the diff, import inventory, provenance and evidence before runtime adoption. Existing acceptance never silently transfers to a new revision.

No automated upstream updates, package installation, upstream build/publish/version scripts, remote metadata refresh or downloaded-source execution are part of this intake. Manual source updates follow the process above. Browser and Node platform implementations remain dependencies that require supported-version maintenance.

Before any runtime use, require independent standards-derived valid/malformed fixtures and independently generated native ES256/RS256 keys/signatures. Cover forgery/algorithm confusion, exact challenge/origin/RP and account/purpose/session/epoch binding, replay/expiry/concurrent single-use consumption, counter/disablement atomicity, malformed/truncated/oversized/duplicate/noncanonical encodings, unsupported formats/key shapes/flags, buffer views and bounded parsing work. Upstream fixtures alone do not establish correctness. Compose existing TOTP/Owner/delegated/privacy/recovery rules, then conduct separately approved hardware/browser rehearsal under private HTTPS staging. No full code audit, cryptographic acceptance, deployment or live enrollment is claimed by these documents.
