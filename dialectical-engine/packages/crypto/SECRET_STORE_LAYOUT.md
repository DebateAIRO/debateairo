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
