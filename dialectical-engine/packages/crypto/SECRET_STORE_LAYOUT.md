# User DEK file layout

S3 provisions one 32-byte user DEK at registration and stores only its AEAD-wrapped envelope:

```text
USER_DEK_STORE_PATH/                 mode 0700
  users/                             mode 0700
    <user uuid>/                     mode 0700
      dek.v1.json                    mode 0600
```

`dek.v1.json` contains the envelope version, opaque user UUID, key identifier, nonce, ciphertext, and authentication tag. It never contains plaintext contact data or the unwrapped DEK. The wrapping KEK is loaded separately and never written here or to Postgres. A later account-deletion slice owns removal of this file; S3 only creates it.

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
