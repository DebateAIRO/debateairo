import { hrtime } from "node:process";

import {
  createCaptureEmitter,
  createCaptureGapCounter,
  createCaptureHealth,
  installCaptureEmitter,
  emit,
  BoundedReferenceQueue,
  type CaptureQueueEntry,
} from "@debateai/obs-capture";

const CALLS = 10_000;
const CAPACITY = 1_024;
const queue = new BoundedReferenceQueue<CaptureQueueEntry>(CAPACITY);
const health = createCaptureHealth();
const gaps = createCaptureGapCounter({ health });
installCaptureEmitter(createCaptureEmitter({ queue, health, gaps, schedule: (task) => task() }));
const samples: bigint[] = [];
for (let index = 0; index < CALLS; index += 1) {
  const started = hrtime.bigint();
  emit({
    code: "OBS_CAPTURE_SELF",
    taxonomy_class: "CAPTURE_SELF",
    capture_point: "self",
    disposition: "SELF",
    source: "first_party",
  });
  samples.push(hrtime.bigint() - started);
}
samples.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
const rank = Math.max(0, Math.ceil(samples.length * 0.99) - 1);
const p99Us = Number((samples[rank] ?? 0n) / 1_000n);
process.stdout.write(`FIX08_OVERHEAD ${JSON.stringify({
  calls: CALLS,
  capacity: CAPACITY,
  depth: queue.size,
  lost: gaps.pendingLossCount(),
  p99_us: p99Us,
})}\n`);
