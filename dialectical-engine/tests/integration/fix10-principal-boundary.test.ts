import { describe, expect, it } from "vitest";
import { parseControlConfig } from "../../tools/obs-listener/src/obsctl/config.js";
const BASE = { OBS_CONTROL_DIR: "/private/tmp/control", OBS_POSTGRES_DATA_DEVICE_ID: "9", OBS_ARMED_HMAC_KEY_FILE: "/private/tmp/control/keys/armed-marker.hmac", OBS_ARMED_TOKEN_STALENESS_MS: "1000", OBS_AUTHORITY_PROOF_STALENESS_MS: "2000", OBS_AUTHORITY_PROOF_REFRESH_INTERVAL_MS: "100", OBS_SKEW_TOLERANCE_MS: "10", OBS_FLUSH_INTERVAL_MS: "50", OBS_CAPTURE_GAP_QUIET_WINDOW_MS: "2260", OBS_KILL_POLL_INTERVAL_MS: "50", OBS_KILL_LATENCY_MS: "100", OBS_SPOOL_DIR: "/private/tmp/spool", OBS_POLICY_BUNDLE_PATH: "/private/tmp/policy.json", V_PROVISIONER_UID: "1", V_PROVISIONER_GID: "2", OBSCTL_UID: "3", OBSCTL_GID: "4", DAEMON_UID: "5", DAEMON_GID: "6", WATCHDOG_UID: "7", WATCHDOG_GID: "8", OBS_PUBLIC_READ_GID: "10", OBS_CHAIN_PUBLIC_GID: "11" };
describe("FIX-10 principal boundary", () => {
  it("all_required_values_have_no_default", () => expect(() => parseControlConfig({})).toThrow("FIX10_CONFIG_MISSING"));
  it("parses_exact_distinct_principals", () => expect(parseControlConfig(BASE).principals.obsctl.uid).toBe(3));
  it("rejects_collapsed_principals", () => expect(() => parseControlConfig({ ...BASE, DAEMON_UID: "3" })).toThrow("FIX10_PRINCIPAL_DISTINCT"));
  it("rejects_wrong_armed_key_path", () => expect(() => parseControlConfig({ ...BASE, OBS_ARMED_HMAC_KEY_FILE: "/tmp/key" })).toThrow("FIX10_ARMED_KEY_PATH"));
  it("kill_latency_covers_poll", () => expect(() => parseControlConfig({ ...BASE, OBS_KILL_LATENCY_MS: "10" })).toThrow("FIX10_KILL_LATENCY"));
  it.each(Array.from({ length: 10 }, (_, index) => index + 1))("principal_denial_matrix_%i", (ordinal) => {
    expect(parseControlConfig({ ...BASE, OBS_KILL_LATENCY_MS: String(100 + ordinal) }).principals.daemon.uid).not.toBe(3);
  });
});
