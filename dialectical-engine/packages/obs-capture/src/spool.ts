import { writeSync } from "node:fs";

import {
  isPostRedactionEnvelope,
  type PostRedactionEnvelope,
} from "./redactor.js";

export interface SpoolWriter {
  prepare(envelope: PostRedactionEnvelope): PreparedSpoolRecord;
  append(envelope: PostRedactionEnvelope): void;
  appendOnExit(record: PreparedSpoolRecord): void;
}

const PREPARED_SPOOL_BRAND: unique symbol = Symbol("PREPARED_SPOOL_RECORD");
const PREPARED_BYTES = new WeakMap<PreparedSpoolRecord, Uint8Array>();

export interface PreparedSpoolRecord {
  readonly [PREPARED_SPOOL_BRAND]: true;
}

type SyncWriter = (
  fd: number,
  buffer: Uint8Array,
  offset: number,
  length: number,
) => number;

const NODE_SYNC_WRITER: SyncWriter = (fd, buffer, offset, length) =>
  writeSync(fd, buffer, offset, length);

export function createPreopenedSpool(options: {
  readonly fd: number;
  readonly envelopeMaxBytes: number;
  readonly write?: SyncWriter;
}): SpoolWriter {
  if (!Number.isSafeInteger(options.fd) || options.fd < 0) {
    throw new RangeError("SPOOL_FD_INVALID");
  }
  if (
    !Number.isSafeInteger(options.envelopeMaxBytes) ||
    options.envelopeMaxBytes <= 0
  ) {
    throw new RangeError("SPOOL_ENVELOPE_MAX_BYTES_INVALID");
  }
  const write = options.write ?? NODE_SYNC_WRITER;
  let poisoned = false;

  function prepare(envelope: PostRedactionEnvelope): PreparedSpoolRecord {
    if (!isPostRedactionEnvelope(envelope)) {
      throw new TypeError("SPOOL_REQUIRES_POST_REDACTION_ENVELOPE");
    }
    const bytes = Buffer.from(`${JSON.stringify(envelope)}\n`, "utf8");
    if (bytes.byteLength > options.envelopeMaxBytes) {
      throw new RangeError("SPOOL_ENVELOPE_TOO_LARGE");
    }
    const record = Object.freeze({
      [PREPARED_SPOOL_BRAND]: true as const,
    });
    PREPARED_BYTES.set(record, bytes);
    return record;
  }

  function appendPrepared(record: PreparedSpoolRecord): void {
    const bytes = PREPARED_BYTES.get(record);
    if (bytes === undefined) {
      throw new TypeError("SPOOL_REQUIRES_PREPARED_POST_REDACTION_RECORD");
    }
    if (poisoned) {
      throw new Error("SPOOL_STREAM_POISONED");
    }
    let offset = 0;
    try {
      while (offset < bytes.byteLength) {
        const remaining = bytes.byteLength - offset;
        const written = write(
          options.fd,
          bytes,
          offset,
          remaining,
        );
        if (
          !Number.isSafeInteger(written) ||
          written <= 0 ||
          written > remaining
        ) {
          throw new Error("SPOOL_WRITE_INCOMPLETE");
        }
        offset += written;
      }
    } catch (error) {
      poisoned = true;
      throw error;
    }
  }

  function append(envelope: PostRedactionEnvelope): void {
    appendPrepared(prepare(envelope));
  }

  return Object.freeze({
    prepare,
    append,
    appendOnExit: appendPrepared,
  });
}
