# User DEK file layout

S3 provisions one 32-byte user DEK at registration and stores only its AEAD-wrapped envelope:

```text
USER_DEK_STORE_PATH/                 mode 0700
  users/                             mode 0700
    <user uuid>/                     mode 0700
      dek.v1.json                    mode 0600
```

`dek.v1.json` contains the envelope version, opaque user UUID, key identifier, nonce, ciphertext, and authentication tag. It never contains plaintext contact data or the unwrapped DEK. The wrapping KEK is loaded separately and never written here or to Postgres. A later account-deletion slice owns removal of this file; S3 only creates it.

Since V-3 the record is `version: 2` and carries `kek_id`: sixteen hex characters
naming WHICH master key wrapped it, so a rotation can re-wrap without trying to
decrypt. It is eight bytes of a domain-separated SHA-256 over the key — a label,
never the key bytes. A `version: 1` record carries no `kek_id` and keeps opening:
it is read as wrapped by the original KEK, which during a changeover means the
current key is tried and then the previous one. The file name does not change
with the record version; it is the store layout's version, not the record's.

The same applies to `publication-key.v1.json` under the corpus KEK. Run content
keys are wrapped by the user DEK rather than by a KEK, so `content-key.v1.json`
stays `version: 1` with no `kek_id` and a KEK rotation never rewrites it — which
is why rotation never re-encrypts content.

### Changing the master key

`pnpm keys:rotate-kek` re-wraps every stored key under a new master key. It reads
with both keys (the new one and `*_KEK_PREVIOUS_PATH`), writes each record back
labelled with the new one, and ends with a verification pass that opens every
record under the new key alone. The previous-key setting is removed once that
pass is clean; its absence is the normal steady state. See
`deploy/vps/README.md` for the operator procedure.

The stable audit source-context Argon2id salt is a separate 32-byte mode-0600
secret at `AUDIT_SOURCE_IP_SALT_PATH`. It is loaded by the API process, never
stored in Postgres, and domain-separates the memory-hard source-IP and user-agent
derivations that remain correlatable within the salt epoch.

## Run and publication key domains

S6 private run-content keys remain under the user DEK and are therefore
user-shreddable:

```text
USER_DEK_STORE_PATH/
  runs/
    <run uuid>/
      content-key.v1.json            mode 0600
```

S8 public-corpus keys use an independently provisioned `CORPUS_KEK_PATH` and a
separately mounted, durable `PUBLICATION_KEY_STORE_PATH`:

```text
PUBLICATION_KEY_STORE_PATH/          durable mode-0700 volume
  publications/
    <publication uuid>/
      publication-key.v1.json        mode 0600
```

The corpus KEK, publication store, user/private KEK, user store, email and
content blind-index keys, audit source salt, and audit-key store must not share
key bytes, inodes, symlink-resolved paths, or nested roots. API startup performs
this check across every loaded key material and configured secret/store path and
fails closed if any pair overlaps. Publication also requires S6 content
encryption to be enabled, so the durable public snapshot is never sourced from
a legacy plaintext run. Unpublish commits PRIVATE plus a database cleanup
intent first; startup and subsequent unpublish requests reconcile that outbox
outside database locks until the public-corpus key directory is destroyed.

Publication-enabled API processes also require a separately provisioned
`AUTHORIZATION_DATABASE_URL`. Its login is a member of the migration-created
`debateai_authorization_runtime` role. Only that credential may invoke the
factor/session rotation that mints a step-up grant; the ordinary
`debateai_runtime` publication credential cannot insert, reset, select, or mint
grants and cannot assume the authorization role.
