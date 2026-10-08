# Owned WebAuthn adaptations — Task 3

Status: dormant application source; root acceptance and private HTTPS hardware rehearsal remain separate gates. Raw reference bytes and SOURCE-INVENTORY.json remain immutable. No acquired source file/module/build/version/test script is imported or executed. No package has been installed or changed.

Only the reviewed encoding, layout and schema pieces below are adapted. Server base64url uses native Buffer. All cryptographic operations are Node built-ins (randomBytes, createHash, createPublicKey, verify with explicit DER / RSA PKCS1 v1.5). DER validation is byte framing only, with no integer conversion, signature unwrap or crypto arithmetic. Browser ceremonies use native navigator.credentials and AbortController. The JSON recursive-descent duplicate detector, bounds/authority policy, SQL persistence and service interfaces are application-owned code.

Exact sources: SimpleWebAuthn server14.0.2 commit545d566cfd521b11287d67a03ea9592dc6e3acec; browser14.0.0 commit83f87addc67b652ff5b84e681669451648216ef6; Tiny-CBOR0.2.11 commit3dfd6c890abf450966fc0349dd2ebb94a30144bb. Full archive/per-file custody is in reference/SOURCE-MANIFEST.json and SOURCE-INVENTORY.json.

| Adapted symbol/concept | Original source | Original SHA256 | Owned symbol | Deliberate divergence |
| --- | --- | --- | --- | --- |
| `decodeLength; major-type constants` | `reference/tiny-cbor-0.2.11/cbor/cbor_internal.ts` | `0cde2b1d2cb08503b6f44c1789736376eac2f5d0ed10db9f73b16caa356c8bd7` | `webauthn-codec.ts/decodeCbor` | Native offset-aware reads, supported majors only, shortest encodings, bounded depth/items/maps; owned map walk/duplicate guards. |
| `parseAuthenticatorData layout/flag constants` | `reference/simplewebauthn-server-14.0.2/packages/server/src/helpers/parseAuthenticatorData.ts` | `8aa7daca4d4934e37386f53953e41db8c42024ae95c5e4007bcec38e53149531` | `webauthn-codec.ts/parseAuthenticatorData` | Exact flags/offset bounds, no AAGUID output; original COSE slice and consumed bytes; no re-encode, mutation workaround or extensions. |
| `COSE public-key labels/constants only` | `reference/simplewebauthn-server-14.0.2/packages/server/src/helpers/cose.ts` | `857cd4c79037a2ffbcd56e333bceaa6afcb0650bd4465ffc3a2edc801d02ef04` | `webauthn-verifier.ts/publicKey` | Only EC2/P-256/ES256 and RSA/RS256; canonical unsigned public data and native import. |
| `fmt/authData/attStmt schema labels only` | `reference/simplewebauthn-server-14.0.2/packages/server/src/helpers/decodeAttestationObject.ts` | `cf3e06d83e9b7ec274b083c6b1dbb01dd978a00494fb016e92319bc3d31a1b0e` | `webauthn-verifier.ts/verifyRegistration` | Exactly none, empty statement, exact map/full consumption; no attestation verifier. |
| `ClientDataJSON field/type schema only` | `reference/simplewebauthn-server-14.0.2/packages/server/src/helpers/decodeClientDataJSON.ts` | `5d1e27cf0f269a7f7a63269ff8de4a06a52c324d0ea505678908f679e8f6bebd` | `webauthn-codec.ts/parseClientData; verifier.ts/client` | Owned duplicate-aware bounded JSON parser; fatal UTF8/BOM behavior and original-byte hashing; present/supported tokenBinding only. |
| `base64URLStringToBuffer atob/Uint8Array pattern` | `reference/simplewebauthn-browser-14.0.0/packages/browser/src/helpers/base64URLStringToBuffer.ts` | `a72f3f3e9e8c4c61436548cc7fd21348d4842125f7fb850e09242d384193dbca` | `staffWebAuthn.ts/staffDecodeBase64url` | Canonical unpadded alphabet/round-trip and byte limits before allocation. |
| `bufferToBase64URLString btoa/Uint8Array pattern` | `reference/simplewebauthn-browser-14.0.0/packages/browser/src/helpers/bufferToBase64URLString.ts` | `9961d252964ab54fb6608896f7744ab4a3b5fe89557fd3088c7150c7db503b5b` | `staffWebAuthn.ts/staffEncodeBase64url` | Offset/length-preserving byte views and per-field bound. |
| `AbortController cancellation pattern` | `reference/simplewebauthn-browser-14.0.0/packages/browser/src/helpers/webAuthnAbortService.ts` | `a483747a5b1a1ac80e31264c9de796d3731437cd30d10e43ec72c9ef57d0933b` | `staffWebAuthn.ts/createStaffWebAuthnBrowser` | Owned per-instance lifetime; cancellation checks after native return; no global singleton or fallback. |

No upstream barrels, encoder, generated DOM types, attestation/certificates/ASN.1/CRL/metadata/PQC/algorithm discovery/network refresh or Firefox EdDSA workaround enters the runtime import closure. Upstream registration/assertion and browser ceremony modules are protocol references only; they are not copied or imported. Node/DOM platform types replace library exports.

The owned clientData schema accepts absent tokenBinding or standard present/supported status, bounded optional ID and opaque bounded future client-data members; unknown tokenBinding statuses (including upstream reference-only not-supported) fail closed. This is the root-reviewed Level3 compatibility limit: https://www.w3.org/TR/webauthn-3/#dictdef-tokenbinding. crossOrigin absent/false is accepted; true and any topOrigin are rejected. BOM decoding follows UTF8 TextDecoder behavior, while native hashing covers untouched original bytes.

The following MIT notices accompany all adapted layout/encoding/schema code. SimpleWebAuthn server and browser share Matthew Miller's notice; Tiny-CBOR retains Levi's notice. Original license files remain intact in reference/.

MIT License

Copyright (c) 2020 Matthew Miller

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

MIT License

Copyright (c) 2025 Levi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
