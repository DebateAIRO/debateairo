import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import type { PostRedactionEnvelope } from "@debateai/obs-capture";
import {
  createClientReportBundle,
  createTransientOriginRateLimiter,
  registerClientReportRoutes,
  type ClientReportDrop,
  type ClientReportStore,
} from "../../apps/api/src/obs-client-report.js";

const SERVER_BUILD_REF = "build-fix06-server";
const CLIENT_BUILD_REF = "build-untrusted-client";
const ORIGIN = "203.0.113.17";

class MemoryClientReportStore implements ClientReportStore {
  readonly occurrences: PostRedactionEnvelope[] = [];
  readonly drops: ClientReportDrop[] = [];

  async writeOccurrence(envelope: PostRedactionEnvelope): Promise<void> {
    this.occurrences.push(envelope);
  }

  async writeDrop(drop: ClientReportDrop): Promise<void> {
    this.drops.push(drop);
  }

  async close(): Promise<void> {}
}

function validPayload() {
  return {
    code: "OBS_CAPTURE_SELF",
    component: "ui-app",
    route_template: "/:segment",
    kind: "error_boundary",
    build_ref: CLIENT_BUILD_REF,
  } as const;
}

async function fixture(maxRequests = 100) {
  const store = new MemoryClientReportStore();
  const api = Fastify({ logger: false });
  registerClientReportRoutes(api, {
    store,
    buildRef: SERVER_BUILD_REF,
    environment: "test",
    limiter: createTransientOriginRateLimiter({
      maxRequests,
      windowMs: 60_000,
      now: () => 1_000,
    }),
  });
  return { api, store };
}

describe("FIX-06 client-report endpoint", () => {
  it("serves the closed bundle and rejects every non-member without a write", async () => {
    const { api, store } = await fixture();
    const bundleResponse = await api.inject({
      method: "GET",
      url: "/v1/obs/client-report/enums",
      remoteAddress: ORIGIN,
    });

    expect(bundleResponse.statusCode).toBe(200);
    expect(bundleResponse.json()).toEqual(createClientReportBundle(SERVER_BUILD_REF));

    for (const payload of [
      { ...validPayload(), code: "NOT_A_MEMBER" },
      { ...validPayload(), component: "free-text-component" },
      { ...validPayload(), route_template: "https://example.test/private" },
      { ...validPayload(), kind: "free-text-kind" },
      { ...validPayload(), message: "CANARY-FIX06-MESSAGE" },
    ]) {
      const response = await api.inject({
        method: "POST",
        url: "/v1/obs/client-report",
        remoteAddress: ORIGIN,
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(store.occurrences).toEqual([]);
    expect(store.drops).toEqual([]);
    await api.close();
  });

  it("assigns the served build and writes the ruled client provenance", async () => {
    const { api, store } = await fixture();
    const response = await api.inject({
      method: "POST",
      url: "/v1/obs/client-report",
      remoteAddress: ORIGIN,
      payload: validPayload(),
    });

    expect(response.statusCode).toBe(202);
    expect(response.body).toBe("");
    expect(store.occurrences).toHaveLength(1);
    expect(store.occurrences[0]).toMatchObject({
      build_ref: SERVER_BUILD_REF,
      runtime: "ui-client",
      capture_point: "client",
      code: "OBS_CAPTURE_SELF",
      taxonomy_class: "CLIENT_FAILURE",
      source: "ui_client",
      component: {
        process: "ui-client",
        package: "@debateai/ui-client",
      },
    });
    expect(JSON.stringify(store.occurrences[0])).not.toContain(CLIENT_BUILD_REF);
    await api.close();
  });

  it("returns later 429s and counts every limited report in a client-drop row", async () => {
    const { api, store } = await fixture();
    const statuses: number[] = [];
    for (let index = 0; index < 200; index += 1) {
      const response = await api.inject({
        method: "POST",
        url: "/v1/obs/client-report",
        remoteAddress: ORIGIN,
        payload: validPayload(),
      });
      statuses.push(response.statusCode);
    }

    expect(statuses.slice(0, 100)).toEqual(Array.from({ length: 100 }, () => 202));
    expect(statuses.slice(100)).toEqual(Array.from({ length: 100 }, () => 429));
    expect(store.occurrences).toHaveLength(100);
    expect(store.drops).toHaveLength(100);
    expect(store.drops).toEqual(store.drops.map((drop) => ({
      source: "ui_client",
      gap_class: "CLIENT_REPORT_RATE_LIMITED",
      lost_count: 1,
      opened_at: new Date(1_000),
      closed_at: new Date(1_000),
    })));
    await api.close();
  });

  it("rotates the transient network-origin salt for each module instance", () => {
    const first = createTransientOriginRateLimiter({ maxRequests: 1, windowMs: 1_000 });
    const second = createTransientOriginRateLimiter({ maxRequests: 1, windowMs: 1_000 });

    expect(first.hashOrigin(ORIGIN)).toMatch(/^[0-9a-f]{64}$/u);
    expect(second.hashOrigin(ORIGIN)).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.hashOrigin(ORIGIN)).not.toBe(second.hashOrigin(ORIGIN));
  });
});
