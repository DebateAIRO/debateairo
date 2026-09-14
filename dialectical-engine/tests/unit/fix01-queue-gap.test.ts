import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

interface GapSummary {
  readonly source: string;
  readonly gap_class: string;
  readonly lost_count: number;
}

interface ExactCountsProbe {
  readonly queueSize: number;
  readonly queuedPayloads: readonly unknown[];
  readonly rows: readonly GapSummary[];
}

function runProbe<T>(program: string): T {
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", program],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    },
  );

  expect(
    child.status,
    ["stdout=", child.stdout, "\nstderr=", child.stderr].join(""),
  ).toBe(0);
  return JSON.parse(child.stdout.trim()) as T;
}

function exactCountsProgram(options: {
  readonly earlyCount: number;
  readonly capacity: number;
  readonly afterSwapCount: number;
}): string {
  return [
    'import { BoundedReferenceQueue, createCaptureEmitter, createCaptureGapCounter, createCaptureHealth, emit, installCaptureEmitter } from "@debateai/obs-capture";',
    "const { earlyCount, capacity, afterSwapCount } = " +
      JSON.stringify(options) +
      ";",
    "for (let index = 0; index < earlyCount; index += 1) emit({ index });",
    "const queue = new BoundedReferenceQueue(capacity);",
    "const health = createCaptureHealth();",
    "const gaps = createCaptureGapCounter({ health });",
    "const emitter = createCaptureEmitter({ queue, health, gaps });",
    "const transfer = installCaptureEmitter(emitter, gaps);",
    "for (let index = 0; index < afterSwapCount; index += 1) emit({ after: index });",
    "await transfer;",
    "const rows = [];",
    "while (await gaps.flushOne((row) => rows.push(row))) {}",
    "process.stdout.write(JSON.stringify({",
    "  queueSize: queue.size,",
    "  queuedPayloads: queue.drain().map((entry) => entry.payload_ref),",
    "  rows: rows.map(({ source, gap_class, lost_count }) => ({ source, gap_class, lost_count })),",
    "}));",
  ].join("\n");
}

describe("FIX-01 exact pre-arm loss transfer", () => {
  it("keeps zero early losses at zero", () => {
    const proof = runProbe<ExactCountsProbe>(
      exactCountsProgram({ earlyCount: 0, capacity: 2, afterSwapCount: 0 }),
    );

    expect(proof).toEqual({
      queueSize: 0,
      queuedPayloads: [],
      rows: [],
    });
  });

  it("transfers one early loss with its exact source and class", () => {
    const proof = runProbe<ExactCountsProbe>(
      exactCountsProgram({ earlyCount: 1, capacity: 2, afterSwapCount: 0 }),
    );

    expect(proof.rows).toEqual([
      {
        source: "first_party",
        gap_class: "QUEUE_FULL",
        lost_count: 1,
      },
    ]);
  });

  it("transfers all 37 same-turn early losses as one exact row", () => {
    const proof = runProbe<ExactCountsProbe>(
      exactCountsProgram({ earlyCount: 37, capacity: 2, afterSwapCount: 0 }),
    );

    expect(proof.rows).toEqual([
      {
        source: "first_party",
        gap_class: "QUEUE_FULL",
        lost_count: 37,
      },
    ]);
  });

  it("swaps before waiting and combines only the new queue overflow with seven old losses", () => {
    const proof = runProbe<ExactCountsProbe>(
      exactCountsProgram({ earlyCount: 7, capacity: 2, afterSwapCount: 3 }),
    );

    expect(proof).toEqual({
      queueSize: 2,
      queuedPayloads: [{ after: 0 }, { after: 1 }],
      rows: [
        {
          source: "first_party",
          gap_class: "QUEUE_FULL",
          lost_count: 8,
        },
      ],
    });
  });

  it("gives old losses only to the first of two same-turn owners", () => {
    const proof = runProbe<{
      readonly sameTransfer: boolean;
      readonly firstRows: readonly GapSummary[];
      readonly secondRows: readonly GapSummary[];
      readonly total: number;
      readonly firstQueue: readonly unknown[];
      readonly secondQueue: readonly unknown[];
    }>([
      'import { BoundedReferenceQueue, createCaptureEmitter, createCaptureGapCounter, createCaptureHealth, emit, installCaptureEmitter } from "@debateai/obs-capture";',
      "for (let index = 0; index < 11; index += 1) emit({ index });",
      "const makeTarget = () => {",
      "  const queue = new BoundedReferenceQueue(2);",
      "  const health = createCaptureHealth();",
      "  const gaps = createCaptureGapCounter({ health });",
      "  return { queue, gaps, emitter: createCaptureEmitter({ queue, health, gaps }) };",
      "};",
      "const first = makeTarget();",
      "const second = makeTarget();",
      "const firstTransfer = installCaptureEmitter(first.emitter, first.gaps);",
      "const secondTransfer = installCaptureEmitter(second.emitter, second.gaps);",
      "emit({ owner: \"second\" });",
      "await Promise.all([firstTransfer, secondTransfer]);",
      "const firstRows = [];",
      "const secondRows = [];",
      "while (await first.gaps.flushOne((row) => firstRows.push(row))) {}",
      "while (await second.gaps.flushOne((row) => secondRows.push(row))) {}",
      "process.stdout.write(JSON.stringify({",
      "  sameTransfer: firstTransfer === secondTransfer,",
      "  firstRows: firstRows.map(({ source, gap_class, lost_count }) => ({ source, gap_class, lost_count })),",
      "  secondRows: secondRows.map(({ source, gap_class, lost_count }) => ({ source, gap_class, lost_count })),",
      "  total: [...firstRows, ...secondRows].reduce((sum, row) => sum + row.lost_count, 0),",
      "  firstQueue: first.queue.drain().map((entry) => entry.payload_ref),",
      "  secondQueue: second.queue.drain().map((entry) => entry.payload_ref),",
      "}));",
    ].join("\n"));

    expect(proof).toEqual({
      sameTransfer: true,
      firstRows: [
        {
          source: "first_party",
          gap_class: "QUEUE_FULL",
          lost_count: 11,
        },
      ],
      secondRows: [],
      total: 11,
      firstQueue: [],
      secondQueue: [{ owner: "second" }],
    });
  });

  it("gives a later third installer no copy of old losses", () => {
    const proof = runProbe<{
      readonly thirdSharesTransfer: boolean;
      readonly firstCounts: readonly number[];
      readonly secondCounts: readonly number[];
      readonly thirdCounts: readonly number[];
    }>([
      'import { BoundedReferenceQueue, createCaptureEmitter, createCaptureGapCounter, createCaptureHealth, emit, installCaptureEmitter } from "@debateai/obs-capture";',
      "for (let index = 0; index < 5; index += 1) emit({ index });",
      "const makeTarget = () => {",
      "  const queue = new BoundedReferenceQueue(1);",
      "  const health = createCaptureHealth();",
      "  const gaps = createCaptureGapCounter({ health });",
      "  return { gaps, emitter: createCaptureEmitter({ queue, health, gaps }) };",
      "};",
      "const first = makeTarget();",
      "const second = makeTarget();",
      "const third = makeTarget();",
      "const firstTransfer = installCaptureEmitter(first.emitter, first.gaps);",
      "const secondTransfer = installCaptureEmitter(second.emitter, second.gaps);",
      "await Promise.all([firstTransfer, secondTransfer]);",
      "const thirdTransfer = installCaptureEmitter(third.emitter, third.gaps);",
      "await thirdTransfer;",
      "const firstRows = [];",
      "const secondRows = [];",
      "const thirdRows = [];",
      "while (await first.gaps.flushOne((row) => firstRows.push(row))) {}",
      "while (await second.gaps.flushOne((row) => secondRows.push(row))) {}",
      "while (await third.gaps.flushOne((row) => thirdRows.push(row))) {}",
      "process.stdout.write(JSON.stringify({",
      "  thirdSharesTransfer: thirdTransfer === firstTransfer,",
      "  firstCounts: firstRows.map((row) => row.lost_count),",
      "  secondCounts: secondRows.map((row) => row.lost_count),",
      "  thirdCounts: thirdRows.map((row) => row.lost_count),",
      "}));",
    ].join("\n"));

    expect(proof).toEqual({
      thirdSharesTransfer: true,
      firstCounts: [5],
      secondCounts: [],
      thirdCounts: [],
    });
  });

  it("keeps the legacy install return undefined and swaps synchronously", () => {
    const proof = runProbe<{
      readonly returnedUndefined: boolean;
      readonly queuedPayloads: readonly unknown[];
    }>([
      'import { BoundedReferenceQueue, createCaptureEmitter, createCaptureGapCounter, createCaptureHealth, emit, installCaptureEmitter } from "@debateai/obs-capture";',
      "const queue = new BoundedReferenceQueue(2);",
      "const health = createCaptureHealth();",
      "const gaps = createCaptureGapCounter({ health });",
      "const result = installCaptureEmitter(createCaptureEmitter({ queue, health, gaps }));",
      "emit({ installed: true });",
      "process.stdout.write(JSON.stringify({",
      "  returnedUndefined: result === undefined,",
      "  queuedPayloads: queue.drain().map((entry) => entry.payload_ref),",
      "}));",
    ].join("\n"));

    expect(proof).toEqual({
      returnedUndefined: true,
      queuedPayloads: [{ installed: true }],
    });
  });

  it("keeps two of five post-swap emits and counts exactly three losses", () => {
    const proof = runProbe<ExactCountsProbe>(
      exactCountsProgram({ earlyCount: 0, capacity: 2, afterSwapCount: 5 }),
    );

    expect(proof).toEqual({
      queueSize: 2,
      queuedPayloads: [{ after: 0 }, { after: 1 }],
      rows: [
        {
          source: "first_party",
          gap_class: "QUEUE_FULL",
          lost_count: 3,
        },
      ],
    });
  });
});
