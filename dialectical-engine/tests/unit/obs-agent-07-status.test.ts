import { describe, expect, it } from "vitest";
import { signalSchema } from "../../apps/observation-agent/src/core/signals.js";
import { statusSnapshotSchema } from "../../apps/observation-agent/src/store/status.js";
import {
  renderStatusHtml,
  serializeStatusJson
} from "../../apps/observation-agent/src/modules/status-page/status-page.js";

const SIGNAL_ID = "70000000-0000-4000-8000-000000000731";

function snapshot(version = "0.1.0") {
  return statusSnapshotSchema.parse({
    pid: 731,
    version,
    thresholds_version: 7,
    mute: { expires_at: "2026-09-05T09:10:00.000Z", component: "hatchet" },
    components: {
      hatchet: {
        state: "DOWN",
        last_probe_at: "2026-09-05T09:00:00.000Z",
        last_ok_at: null,
        open_signal_ids: [SIGNAL_ID]
      }
    },
    modules: {
      routing: [
        { kind: "state", key: "ack.state", state: "OPEN_UNACKED" },
        { kind: "channels", key: "route.fatal", channels: [
          "osascript", "sendmail", "kanban", "digest", "status"
        ] }
      ]
    }
  });
}

function signal() {
  const at = "2026-09-05T09:00:00.000Z";
  return signalSchema.parse({
    seq: 731, signal_id: SIGNAL_ID, state: "OPEN", class: "INFRA_DOWN",
    component: "hatchet", severity: "FATAL", impact_code: "IMPACT_HATCHET_DOWN",
    first_failed_probe_at: at, detected_at: at,
    evidence: { probe: "http_get", last_status: "FAILED" },
    suspected_defect: false, defect_kind: null, run_ref: null, work_item_ref: null,
    threshold_version: 7, clears_signal_id: null, recorded_at: at
  });
}

describe("OBS-07 status page", () => {
  it("renders refresh, agent/threshold/mute, component and fixed open-signal fields", () => {
    const html = renderStatusHtml(snapshot(), [signal()]);
    expect(html).toContain('<meta http-equiv="refresh" content="10">');
    expect(html).toContain("ObservationAgent 0.1.0");
    expect(html).toContain("thresholds 7");
    expect(html).toContain("mute hatchet until 2026-09-05T09:10:00.000Z");
    for (const value of [
      "hatchet", "DOWN", "FATAL", "INFRA_DOWN", SIGNAL_ID,
      "Hatchet is down: asks are accepted but no debate work is dispatched or run."
    ]) expect(html).toContain(value);
  });

  it("escapes hostile typed display values and produces parse-equivalent safe JSON", () => {
    const hostile = snapshot('</title><script>alert("x")</script>');
    const html = renderStatusHtml(hostile, [signal()]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;/title&gt;&lt;script&gt;");
    const json = serializeStatusJson(hostile);
    expect(json).not.toContain("<script>");
    expect(JSON.parse(json)).toEqual(hostile);
  });
});
