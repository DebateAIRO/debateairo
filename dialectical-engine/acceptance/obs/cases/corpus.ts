import { constants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { ObsAcceptanceCase, ObsCaseContext } from "../index.js";

export const FIX08_RUNTIME_SUBJECT = "packages/obs-capture/src/runtime/index.ts" as const;

export const CORPUS_TOKENS = Object.freeze({
  bearerApiKey: "Bearer sk_fix08_local_A1B2C3D4E5F6",
  passwordUrl: "postgres://fix08:OnlyLocal-Pass@127.0.0.1:1/fix08",
  email: "fix08-canary@example.invalid",
  jwt: "eyJhbGciOiJub25lIn0.eyJmaXgwOCI6ImxvY2FsIn0.",
  privateKeyHeader: "-----BEGIN PRIVATE KEY-----",
  sixDigitCode: "code 482913",
});

export interface RawByteSource {
  readonly source: string;
  readonly bytes: Uint8Array;
}

export interface CorpusHit {
  readonly source: string;
  readonly tokenClass: keyof typeof CORPUS_TOKENS;
}

export interface CorpusEvaluation {
  readonly passed: boolean;
  readonly scannedBytes: number;
  readonly hits: readonly CorpusHit[];
}

export function evaluateCorpusBytes(sources: readonly RawByteSource[]): CorpusEvaluation {
  let scannedBytes = 0;
  const hits: CorpusHit[] = [];
  for (const source of sources) {
    const bytes = Buffer.from(source.bytes.buffer, source.bytes.byteOffset, source.bytes.byteLength);
    scannedBytes += bytes.byteLength;
    for (const [tokenClass, token] of Object.entries(CORPUS_TOKENS) as [keyof typeof CORPUS_TOKENS, string][]) {
      if (bytes.indexOf(Buffer.from(token, "utf8")) !== -1) {
        hits.push(Object.freeze({ source: source.source, tokenClass }));
      }
    }
  }
  return Object.freeze({
    passed: hits.length === 0,
    scannedBytes,
    hits: Object.freeze(hits),
  });
}

export async function readRawSpoolSources(spoolDirectory: string): Promise<readonly RawByteSource[]> {
  const entries = (await readdir(spoolDirectory, { withFileTypes: true }))
    .filter((entry) => entry.name.endsWith(".spool"))
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  const sources: RawByteSource[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) throw new Error("FIX08_SPOOL_ENTRY_NOT_REGULAR");
    const file = await open(
      join(spoolDirectory, entry.name),
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      const metadata = await file.stat();
      if (!metadata.isFile()) throw new Error("FIX08_SPOOL_ENTRY_NOT_REGULAR");
      sources.push(Object.freeze({
        source: `spool:${entry.name}`,
        bytes: await file.readFile(),
      }));
    } finally {
      await file.close();
    }
  }
  return Object.freeze(sources);
}

export const corpusCase: ObsAcceptanceCase = Object.freeze({
  name: "corpus",
  subjectPaths: Object.freeze([FIX08_RUNTIME_SUBJECT]),
  async run(context: ObsCaseContext) {
    return context.fail("LIVE_PIPELINE_BINDING_REQUIRED", { failures: 1 });
  },
});
