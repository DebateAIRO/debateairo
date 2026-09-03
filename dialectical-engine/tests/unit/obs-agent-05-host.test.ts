import { describe, expect, it } from "vitest";
import {
  parseDf,
  parseDockerStats,
  parseDockerSystemDf,
  parseLoadAverage,
  parseVmStat
} from "../../apps/observation-agent/src/modules/host-capacity/parsers.js";
import { createHostCapacityTracker } from "../../apps/observation-agent/src/modules/host-capacity/tracker.js";
import type { HostCapacitySnapshot } from "../../apps/observation-agent/src/modules/host-capacity/commands.js";

const at = new Date("2026-09-03T12:00:00.000Z");

function snapshot(overrides: Partial<HostCapacitySnapshot> = {}): HostCapacitySnapshot {
  return Object.freeze({
    diskTotalBytes: 1_024_000,
    diskFreeBytes: 200_000,
    diskFreePercent: 19.53125,
    dockerDiskBytes: 1_500_000_000,
    memoryTotalBytes: 32_000,
    memoryAvailableBytes: 16_000,
    memoryAvailablePercent: 50,
    loadOneMinute: 1.5,
    logicalCores: 10,
    containers: Object.freeze([]),
    observedAt: at,
    ...overrides
  });
}

const thresholds = Object.freeze({
  diskDegradedFreePercent: 15,
  diskFatalFreePercent: 5,
  memorySevereAvailablePercent: 10,
  loadPerCoreMultiplier: 2,
  loadSustainedSamples: 10,
  clearSamples: 2
});

describe("OBS-05 host capacity", () => {
  it("parses locale and whitespace variants into typed disk, VM, load and Docker values", () => {
    expect(parseDf("Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk3s1 1000 800 200 80% /\n"))
      .toEqual({ totalBytes: 1_024_000, freeBytes: 204_800, freePercent: 20 });
    expect(parseVmStat("Mach Virtual Memory Statistics: (page size of 16.384 bytes)\nPages free: 100.\n Pages inactive:   200.\nPages speculative: 10.\n", 32_000_000))
      .toEqual({ totalBytes: 32_000_000, availableBytes: 5_079_040, availablePercent: 15.872 });
    expect(parseLoadAverage("{ 1,50  2,25  3,00 }")).toBe(1.5);
    expect(parseDockerSystemDf([
      '{"Type":"Images","Size":"901,5MB"}',
      '  {"Type":"Local Volumes","Size":"124.5 MB"}  '
    ].join("\n"))).toBe(1_026_000_000);
    expect(parseDockerStats([
      '{"Name":"debateai-v3-postgres-1","CPUPerc":"5,50%","MemUsage":"474MiB / 8GiB","MemPerc":"5.79%"}',
      '{"Name":"debateai-v3-hatchet-lite-1","CPUPerc":"10%","MemUsage":"68 MB / 1 GB","MemPerc":"6,8%"}'
    ].join("\n"))).toEqual([
      { name: "debateai-v3-postgres-1", cpuPercent: 5.5, memoryUsedBytes: 497_025_024, memoryLimitBytes: 8_589_934_592, memoryPercent: 5.79 },
      { name: "debateai-v3-hatchet-lite-1", cpuPercent: 10, memoryUsedBytes: 68_000_000, memoryLimitBytes: 1_000_000_000, memoryPercent: 6.8 }
    ]);
  });

  it("opens disk and memory bands at their strict lower boundaries and clears after two samples", () => {
    const tracker = createHostCapacityTracker();
    expect(tracker.observe({ snapshot: snapshot({ diskFreePercent: 14.9 }), thresholds }).intents)
      .toMatchObject([{ state: "OPEN", severity: "DEGRADED", impactCode: "IMPACT_DISK" }]);
    expect(tracker.observe({ snapshot: snapshot({ diskFreePercent: 4.9 }), thresholds }).intents)
      .toMatchObject([
        { state: "CLEARED", severity: "DEGRADED" },
        { state: "OPEN", severity: "FATAL", impactCode: "IMPACT_DISK" }
      ]);
    expect(tracker.observe({ snapshot: snapshot({ diskFreePercent: 20, memoryAvailablePercent: 9.9 }), thresholds }).intents)
      .toMatchObject([{ state: "OPEN", severity: "SEVERE", impactCode: "IMPACT_MEMORY" }]);
    expect(tracker.observe({ snapshot: snapshot(), thresholds }).intents)
      .toMatchObject([{ state: "CLEARED", severity: "FATAL" }]);
    expect(tracker.observe({ snapshot: snapshot(), thresholds }).intents)
      .toMatchObject([{ state: "CLEARED", severity: "SEVERE" }]);
  });

  it("requires ten 30-second high-load samples before DEGRADED", () => {
    const tracker = createHostCapacityTracker();
    for (let index = 0; index < 9; index += 1) {
      const observedAt = new Date(at.getTime() + index * 30_000);
      expect(tracker.observe({ snapshot: snapshot({ loadOneMinute: 20.1, observedAt }), thresholds }).intents)
        .toHaveLength(0);
    }
    const opened = tracker.observe({
      snapshot: snapshot({ loadOneMinute: 20.1, observedAt: new Date(at.getTime() + 270_000) }),
      thresholds
    });
    expect(opened.intents).toMatchObject([
      { state: "OPEN", severity: "DEGRADED", impactCode: "IMPACT_MEMORY" }
    ]);
  });
});
