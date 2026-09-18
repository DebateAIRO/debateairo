import { describe, expect, it } from "vitest";
import type { SupportConfigurationStatus } from "../../packages/register/src/index.js";
import { parseRegisterVersionText } from "../../packages/register/src/index.js";
import {
  retentionLine,
  renderSupportStatus,
  type SupportStatusRepositoryPort
} from "../../apps/runner/src/support-status-cli.js";

const ERASURE_LINE = "erasures: run pnpm support:shred --owner <owner_ref> --yes after each account erasure (wiring pending V, row V-26)";
const UNAVAILABLE_LINE = "retention: unavailable — support register not initialized";

const support: SupportStatusRepositoryPort = {
  readStatus: async () => ({
    callsToday: 0,
    deflection7Days: null,deflection30Days: null,
    ratingResolution7Days: null,ratingResolution30Days: null,
    openSessions: 0,
    newCases: 0,
    kbVersion: "a".repeat(64),
    kbShipped: 0,
    kbIgnored: 0,
    relayState: "UNAVAILABLE"
  })
};

function registerStatus(rows: readonly Readonly<{
  row_key: string;
  value_json_text: string;
  source_ref: string;
}>[]): NonNullable<SupportConfigurationStatus> {
  return {
    supportRegisterVersion: parseRegisterVersionText("9007199254740992"),
    schemaVersion: 1,
    baseRegisterVersion: parseRegisterVersionText("4"),
    publicationId: "11111111-1111-4111-8111-111111111111",
    requestSha256: "1".repeat(64),
    snapshotSha256: "2".repeat(64),
    supportSnapshotSha256: "3".repeat(64),
    changedKeys: ["support_retention_policy"],
    sourceRef: "deployment:test",
    recordedAt: new Date("2026-09-07T10:00:00.000Z"),
    configurationText: JSON.stringify(rows)
  };
}

describe("SUP-07 truthful retention status", () => {
  it("renders keep, pending, and ratified values without implying an actor", () => {
    expect(retentionLine({ policy: "keep", ratifiedBy: null })).toBe("retention: keep");
    expect(retentionLine({ policy: "shred-after-days:30", ratifiedBy: null }))
      .toBe("retention: shred-after-days:30 (pending V ratification — inert)");
    expect(retentionLine({ policy: "shred-after-days:30", ratifiedBy: "V" }))
      .toBe("retention: shred-after-days:30");
  });

  it("prints unavailable retention and the manual erasure step when uninitialized", async () => {
    await expect(renderSupportStatus({
      registerStatus: { readSupportStatus: async () => null },
      support
    })).resolves.toBe(
      `support configuration: UNINITIALIZED\n${UNAVAILABLE_LINE}\n${ERASURE_LINE}\n`
    );
  });

  it("keeps the manual erasure line visible when the register read is unavailable", async () => {
    const output = await renderSupportStatus({
      registerStatus: { readSupportStatus: async () => {
        throw new TypeError("REGISTER_UNAVAILABLE");
      } },
      support
    });
    expect(output).toBe(
      `support configuration: UNAVAILABLE\n${UNAVAILABLE_LINE}\n${ERASURE_LINE}\n`
    );
  });

  it("treats missing or invalid retention rows as unavailable without implying keep", async () => {
    for (const rows of [
      [],
      [{ row_key: "support_retention_policy", value_json_text: '"keep"', source_ref: "test" }],
      [
        { row_key: "support_retention_policy", value_json_text: '"shred-after-days:0"', source_ref: "test" },
        { row_key: "support_retention_ratified_by", value_json_text: "null", source_ref: "test" }
      ]
    ]) {
      const output = await renderSupportStatus({
        registerStatus: { readSupportStatus: async () => registerStatus(rows) },
        support
      });
      expect(output).toContain(UNAVAILABLE_LINE);
      expect(output).toContain(ERASURE_LINE);
      expect(output).not.toContain("retention: keep");
    }
  });

  it("prints pending as inert and adds the no-actor line only for ratified non-keep", async () => {
    const rows = (policy: string, ratifiedBy: string) => [
      { row_key: "support_retention_policy", value_json_text: JSON.stringify(policy), source_ref: "test" },
      { row_key: "support_retention_ratified_by", value_json_text: ratifiedBy, source_ref: "test" }
    ];
    const pending = await renderSupportStatus({
      registerStatus: {
        readSupportStatus: async () => registerStatus(rows("shred-after-days:30", "null"))
      },
      support
    });
    expect(pending).toContain("retention: shred-after-days:30 (pending V ratification — inert)");
    expect(pending).not.toContain("retention actor:");
    expect(pending).toContain(ERASURE_LINE);

    const ratified = await renderSupportStatus({
      registerStatus: {
        readSupportStatus: async () => registerStatus(rows("shred-after-days:30", '"V"'))
      },
      support
    });
    expect(ratified).toContain("retention: shred-after-days:30\n");
    expect(ratified).toContain(
      "retention actor: unavailable — no age-based shred command is implemented"
    );
    expect(ratified).toContain(ERASURE_LINE);
  });
});
