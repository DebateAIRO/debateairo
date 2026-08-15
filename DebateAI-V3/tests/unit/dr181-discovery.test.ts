import { describe, expect, it } from "vitest";
import {
  discoverPanel,
  resolveFreshDiscovery,
  type DiscoveredProvider,
  type ProbeTarget
} from "../../acceptance/discovery.js";
import { CliRelayFailure, type CliRelayAdapter } from "../../acceptance/relay-core.js";
import { parseCodexRolloutModel } from "../../acceptance/model-shim.js";

const adapter: CliRelayAdapter = {
  maker: "fixture-maker",
  failureCode: "FIXTURE_CLI_FAILED",
  timeoutCode: "FIXTURE_CLI_TIMEOUT",
  buildArguments: () => [],
  parseCompletion: (stdout) => {
    const decoded = JSON.parse(stdout) as { readonly content?: unknown; readonly model?: unknown };
    if (typeof decoded.content !== "string" || decoded.content.trim() === ""
      || typeof decoded.model !== "string" || decoded.model.trim() === "") {
      throw new CliRelayFailure("FAILED", "FIXTURE_CLI_MODEL_UNRESOLVED");
    }
    return { content: decoded.content, model: decoded.model, usage: null };
  }
};

function target(index: number, outcome: "healthy" | "failed" = "healthy"): ProbeTarget {
  const script = outcome === "healthy"
    ? `process.stdout.write(JSON.stringify({content:"OK",model:"model-${index}"}))`
    : "process.exit(7)";
  return {
    providerRef: `provider-${index}`,
    maker: `maker-${index}`,
    command: { binary: process.execPath, prefixArguments: ["-e", script] },
    adapter,
    handshakePrompt: "health"
  };
}

describe("DR-181 discovery panel", () => {
  it.each([1, 2, 3, 4])("discovers an N-generic healthy panel of %i", async (size) => {
    const result = await discoverPanel(
      Array.from({ length: size }, (_, index) => target(index + 1)),
      1_000,
      () => new Date("2026-08-14T12:00:00Z")
    );
    expect(result.filter((row) => row.state === "HEALTHY")).toHaveLength(size);
    expect(result.map((row) => row.providerRef)).toEqual(
      Array.from({ length: size }, (_, index) => `provider-${index + 1}`)
    );
  });

  it("records one dead CLI as ABSENT without losing healthy members", async () => {
    const result = await discoverPanel(
      [target(1), target(2, "failed"), target(3)],
      1_000,
      () => new Date("2026-08-14T12:00:00Z")
    );
    expect(result.filter((row) => row.state === "HEALTHY")).toHaveLength(2);
    expect(result[1]).toMatchObject({
      providerRef: "provider-2",
      state: "ABSENT",
      failureCode: "FIXTURE_CLI_FAILED"
    });
  });

  it("reuses fresh records and re-probes only stale providers once", async () => {
    const records: readonly DiscoveredProvider[] = [
      {
        probeEvidenceRef: "probe-fresh",
        providerRef: "provider-1",
        maker: "maker-1",
        state: "HEALTHY",
        modelId: "model-old-1",
        probedAt: new Date("2026-08-14T11:55:01Z")
      },
      {
        probeEvidenceRef: "probe-stale",
        providerRef: "provider-2",
        maker: "maker-2",
        state: "HEALTHY",
        modelId: "model-old-2",
        probedAt: new Date("2026-08-14T11:49:59Z")
      }
    ];
    const probed: string[] = [];
    const resolved = await resolveFreshDiscovery({
      targets: [target(1), target(2)],
      latestRecords: records,
      probeFreshnessMs: 600_000,
      now: new Date("2026-08-14T12:00:00Z"),
      probe: async (candidate) => {
        probed.push(candidate.providerRef);
        return {
          probeEvidenceRef: "probe-new",
          providerRef: candidate.providerRef,
          maker: candidate.maker,
          state: "ABSENT",
          failureCode: "FIXTURE_CLI_FAILED",
          probedAt: new Date("2026-08-14T12:00:00Z")
        };
      }
    });
    expect(probed).toEqual(["provider-2"]);
    expect(resolved.panel.map((row) => row.providerRef)).toEqual(["provider-1"]);
    expect(resolved.observations[1]).toMatchObject({ state: "ABSENT" });
  });

  it("accepts exactly one rollout-reported Codex model id and refuses zero or several", () => {
    const session = JSON.stringify({ type: "session_meta", payload: { id: "thread-1" } });
    expect(parseCodexRolloutModel([
      session,
      JSON.stringify({ type: "turn_context", payload: { model: "gpt-fixture" } })
    ].join("\n"), "thread-1")).toBe("gpt-fixture");
    expect(() => parseCodexRolloutModel(session, "thread-1"))
      .toThrowError(expect.objectContaining({ message: "CODEX_CLI_MODEL_UNRESOLVED" }));
    expect(() => parseCodexRolloutModel([
      session,
      JSON.stringify({ type: "turn_context", payload: { model: "gpt-a" } }),
      JSON.stringify({ type: "turn_context", payload: { model: "gpt-b" } })
    ].join("\n"), "thread-1"))
      .toThrowError(expect.objectContaining({ message: "CODEX_CLI_MODEL_UNRESOLVED" }));
  });
});
