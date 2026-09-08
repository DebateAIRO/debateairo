import { constants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { ObsAcceptanceCase, ObsCaseContext } from "../index.js";
import { readRawObsBytes } from "../database.js";
import { CORPUS_TOKENS } from "../case-inputs.js";

export const FIX08_RUNTIME_SUBJECT = "packages/obs-capture/src/runtime/index.ts" as const;

export { CORPUS_TOKENS } from "../case-inputs.js";

const CAPTURE_SUBJECT = "acceptance/obs/subjects/capture-subject.ts";

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
  subjectPaths: Object.freeze([FIX08_RUNTIME_SUBJECT, CAPTURE_SUBJECT]),
  async run(context: ObsCaseContext) {
    if (!process.env.OBS_WRITER_DATABASE_URL?.trim()) {
      return context.skipMissing("OBS_WRITER_DATABASE_URL");
    }
    if (!process.env.OBS_LISTENER_DATABASE_URL?.trim()) {
      return context.skipMissing("OBS_LISTENER_DATABASE_URL");
    }
    if (!process.env.OBS_SPOOL_DIR?.trim()) {
      return context.skipMissing("OBS_SPOOL_DIR");
    }
    try {
      const receipt = await context.spawn({
        command: process.execPath,
        arguments: ["--import", "tsx", CAPTURE_SUBJECT, "corpus"],
        environment: {
          OBS_WRITER_DATABASE_URL: process.env.OBS_WRITER_DATABASE_URL,
          OBS_SPOOL_DIR: process.env.OBS_SPOOL_DIR,
        },
        timeoutMs: 10_000,
        rowExpectation: { runtime: "scheduler", capturePoint: "job" },
      });
      if (receipt.exitCode !== 0 || receipt.declaredRunRef === undefined || receipt.stderr !== "") {
        return context.fail("CORPUS_SUBJECT_FAILED", { failures: 1 });
      }
      const sources = [
        ...await readRawObsBytes(receipt.declaredRunRef),
        ...await readRawSpoolSources(process.env.OBS_SPOOL_DIR),
      ];
      const evaluation = evaluateCorpusBytes(sources);
      if (!evaluation.passed) {
        return context.fail("CORPUS_TOKEN_STORED", { hits: evaluation.hits.length });
      }
      return context.passRows(receipt, {
        scanned_bytes: evaluation.scannedBytes,
        token_classes: Object.keys(CORPUS_TOKENS).length,
      });
    } catch {
      return context.fail("CORPUS_PROOF_UNAVAILABLE", { failures: 1 });
    }
  },
});
