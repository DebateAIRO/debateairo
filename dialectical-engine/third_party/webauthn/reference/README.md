# WebAuthn source reference

This directory holds commit-frozen upstream source for our owned implementation review. It is not runtime code and is outside the app compiler includes.

SOURCE-MANIFEST.json records each original path, local hash, version, commit, archive hash and published artifact integrity. Original MIT licenses are retained beside each source.

We will use browser credential APIs and Node built-in cryptography, and adopt only reviewed protocol/encoding/parsing parts. Certificate attestation, CRL/network/metadata services, trust stores, PQC algorithms and automatic update mechanisms are outside our approved attestation:none ES256/RS256 scope.

Before any adoption: review every retained runtime import, define bounded parsing/failure behavior, run independent standard/cryptographic fixtures and application replay/origin/session/epoch tests, and perform separately approved hardware/private HTTPS rehearsal.

All future modifications require an explicit diff, test evidence, provenance/license preservation and root acceptance. No automatic upstream updates.
