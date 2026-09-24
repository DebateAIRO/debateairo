import { Buffer } from "node:buffer";
import type { SupportKeyPort } from "../../apps/api/src/support/keys.js";

/**
 * FW-E. The key material the SUP-01 benchmark's disposable support KEK holds.
 * It is a test constant, not a secret: the harness writes it to a fresh
 * temporary file for one process and deletes it on close. It lives here so the
 * pin in `tests/unit/sup-01-eval-source-pseudonym.test.ts` derives pseudonyms
 * under the SAME key the harness runs with, rather than a lookalike.
 */
export function supportEvalKekMaterial(): Buffer {
  return Buffer.alloc(32,0x65);
}

/**
 * FW-E. The source pseudonym the benchmark hands the API for a caller's
 * network. It MUST be production's keyed derivation, because the value is not
 * decoration: it is stored, and `support.admission_event.ip_sha256` is a
 * `character(64)` column under
 * `CONSTRAINT support_admission_event_ip_ck CHECK (ip_sha256 ~ '^[0-9a-f]{64}$')`
 * (migrations/0054_support_keys_audit.sql), with the same grammar on
 * `support.abuse_event.ip_sha256` since migrations/0050_support_foundation.sql.
 *
 * A labelled stand-in ("eval-pseudonym:<ip>") satisfies neither, so every
 * `POST /v1/support/sessions` the benchmark opened was rejected by the database
 * before any model call and every case scored as an `execution` failure — the
 * benchmark reported 0/60 while measuring nothing about the answers.
 *
 * This is production's own derivation, not an imitation of it: the same
 * `SupportKeyPort.sourcePseudonym` the API wires at `apps/api/src/main.ts`,
 * keyed off the disposable support KEK the harness already creates for its
 * session and content envelopes. No plain digest stands in for it, so the
 * benchmark exercises the shape the deployed column will actually hold.
 */
export function createEvalSourcePseudonym(
  keys: Pick<SupportKeyPort,"sourcePseudonym">
): (value: string) => string {
  return (value: string) => keys.sourcePseudonym(value);
}
