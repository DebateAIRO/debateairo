// deploy/vps/drill-decrypt-sample.ts
// The last arm of restore-drill.sh: prove that ONE real encrypted run row can be opened again
// with the keys that came out of the two backup envelopes (audit L2-F3, L5-F8).
//
// This is the only assertion in the drill that is worth anything. A row count proves the dump
// parsed; this proves the ciphertext is still ciphertext-of-something and that the restored
// KEK -> user DEK -> run content key chain is intact end to end.
//
// It never prints, logs or returns plaintext: the proof is that ContentCipher.decrypt returned
// an object of the expected shape, so only the run id, the field count and the byte length of
// the re-serialised value are reported. AEAD binds the run id, carrier, primary key and owner,
// so a decrypt that succeeds could not have come from another run's key.
//
// Invoked by restore-drill.sh as the postgres OS user against the scratch database:
//   DRILL_DATABASE_URL=... DRILL_KEK_PATH=... DRILL_USER_DEK_STORE_PATH=... tsx drill-decrypt-sample.ts
import { ContentCipher, FileRunContentKeyStore, FileUserDekStore, loadKek } from "@debateai/crypto";
import type { CryptoEnvelope } from "@debateai/crypto";
import pg from "pg";

function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") throw new TypeError(`RESTORE_DRILL_ENV_MISSING:${key}`);
  return value;
}

const databaseUrl = required("DRILL_DATABASE_URL");
const kekPath = required("DRILL_KEK_PATH");
const storePath = required("DRILL_USER_DEK_STORE_PATH");

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
try {
  const sample = await pool.query<{ run_id: string; content_ciphertext: CryptoEnvelope }>(
    `SELECT run_id, content_ciphertext
     FROM core.run
     WHERE content_encryption_version = 1 AND content_ciphertext IS NOT NULL
     ORDER BY created_at_seq DESC
     LIMIT 1`
  );
  const row = sample.rows[0];
  if (row === undefined) {
    // Fail closed. An empty result means either the dump carried no encrypted run or the
    // restore silently dropped the carrier column; neither is a passing drill.
    throw new TypeError("RESTORE_DRILL_NO_ENCRYPTED_RUN");
  }

  const kek = loadKek(kekPath);
  const users = new FileUserDekStore(storePath, kek);
  const keys = new FileRunContentKeyStore(storePath, users, async (ownerRef) => {
    const resolved = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM identity."user" WHERE owner_ref=$1 AND state='active'`,
      [ownerRef]
    );
    const userId = resolved.rows[0]?.user_id;
    if (userId === undefined) throw new TypeError("RESTORE_DRILL_OWNER_REF_UNRESOLVED");
    return userId;
  });

  const decrypted = await new ContentCipher(keys).decrypt<Record<string, unknown>>(
    row.run_id,
    "core.run",
    row.run_id,
    row.content_ciphertext
  );
  if (typeof decrypted !== "object" || decrypted === null) {
    throw new TypeError("RESTORE_DRILL_DECRYPT_SHAPE_INVALID");
  }
  const fields = Object.keys(decrypted).length;
  if (fields === 0) throw new TypeError("RESTORE_DRILL_DECRYPT_SHAPE_INVALID");
  const bytes = Buffer.byteLength(JSON.stringify(decrypted), "utf8");
  console.log(`RESTORE_DRILL_DECRYPT_OK run=${row.run_id} fields=${fields} bytes=${bytes}`);
} finally {
  await pool.end();
}
