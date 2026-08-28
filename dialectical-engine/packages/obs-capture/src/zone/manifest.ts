import { createHash } from "node:crypto";

/**
 * Human-owned RP-1 input. These are literal classification prefixes only.
 * Runtime code must never probe, import, read, list, or otherwise distinguish
 * whether any named zone path or identity table exists. The accepted cost is
 * that a rename is not discovered by this gate; mount reality is proven only
 * from the separately authorized text of apps/api/src/index.ts.
 *
 * Canonical recipe: UTF-8 JSON.stringify of the object below, with keys and
 * array members in the written order, followed by one LF byte. The hash is
 * lowercase SHA-256 of those exact bytes.
 */
export const ZONE_MANIFEST = Object.freeze({
  schema_version: 1,
  zone_path_prefixes: Object.freeze([
    "apps/api/src/mail-channel.ts",
    "apps/api/src/mfa.ts",
    "apps/api/src/registration.ts",
    "migrations/0030_identity_foundation.sql",
    "migrations/0031_registration_verification.sql",
    "migrations/0032_registration_audit_erasure_checks.sql",
    "migrations/0033_verification_token_credentials.sql",
    "packages/db/src/identity.ts",
  ]),
  compiled_alternate_prefixes: Object.freeze([
    "apps/api/dist/mail-channel.js",
    "apps/api/dist/mfa.js",
    "apps/api/dist/registration.js",
    "dist/apps/api/src/mail-channel.js",
    "dist/apps/api/src/mfa.js",
    "dist/apps/api/src/registration.js",
    "dist/packages/db/src/identity.js",
    "packages/db/dist/identity.js",
  ]),
  mount_list: Object.freeze([
    "/v1/auth/register",
    "/v1/auth/verify-email",
    "/v1/auth/resend-verification",
  ]),
  identity_table_deny_set: Object.freeze(["identity.*"]),
});

export type ZoneManifest = typeof ZONE_MANIFEST;

export const ZONE_MANIFEST_CANONICAL_BYTES = `${JSON.stringify(ZONE_MANIFEST)}\n`;

export const ZONE_MANIFEST_HASH = createHash("sha256")
  .update(ZONE_MANIFEST_CANONICAL_BYTES, "utf8")
  .digest("hex");

