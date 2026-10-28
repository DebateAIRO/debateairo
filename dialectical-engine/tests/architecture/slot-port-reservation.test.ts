import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NV-55: no local non-root process can stand in for a slot. On the public server the four slot listeners (website
 * 481/482, API 491/492) are below 1024, where only root or a holder of CAP_NET_BIND_SERVICE may bind; of this kit's
 * units only the website and the API hold it, each limited to its own two ports. No health check, root probe or
 * runbook helper sends a secret to a slot's listener.
 */
const engineRoot = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(engineRoot, path), "utf8");
const configLines = (text: string) => text.split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"));
const envOf = (path: string) => new Map(configLines(read(path)).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));

/**
 * The Fetch standard's bad ports (https://fetch.spec.whatwg.org/#block-bad-port), the list both the website's API fetch
 * and root's httpGet obey (undici 8.10.2 lib/web/fetch/constants.js:14-21): a slot port on it would never be reached.
 */
const FETCH_BAD_PORTS = Object.freeze([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111,
  113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548,
  554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566,
  6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080
]);

describe("NV-55: no secret goes to a slot's listener", () => {
  it("the health checks carry no secret, and the runbook's readyz() helper sends no header", () => {
    const vps = /^\(debateai_slots\) \{\n([\s\S]*?)^\}$/mu.exec(read("deploy/vps/Caddyfile"))?.[1] ?? "";
    expect(vps).not.toBe("");
    expect(vps).not.toContain("health_headers");
    expect(vps.match(/ui-edge\.caddy\.secret/gu)).toHaveLength(1);
    expect(vps).toContain("header_up X-Debateai-Edge-Secret {file./etc/debateai/ui-edge.caddy.secret}");
    const preview = read("deploy/preview-release/v1/caddy/debateai-slots.caddy");
    expect(preview).not.toContain("health_headers");
    expect(preview).not.toContain("Edge-Secret");
    const guide = read("deploy/preview-release/v1/README.md");
    expect(guide).not.toContain("printf 'X-Debateai-Edge-Secret:");
    expect(guide).not.toMatch(/-H\s+['"]?x-debateai-edge-secret/iu);
    const helper = "readyz() { curl -s -m 5 -w '\\n%{http_code}' \"http://127.0.0.1:$1/readyz\" || true; }";
    expect(guide.split("\n").filter((line) => line === helper)).toHaveLength(2);
  });
});

describe("NV-55: every VPS slot port is reserved and consistent", () => {
  it("the Caddy upstreams, the layout, the overlays and the base files agree, below 512 and off the bad-port list", async () => {
    const common = await import("../../deploy/" + "preview-lifecycle/v1/common.mjs") as {
      VPS_LAYOUT: { slots: Record<"A" | "B", { uiPort: string; apiPort: string }> };
    };
    const { A, B } = common.VPS_LAYOUT.slots;
    const caddy = read("deploy/vps/Caddyfile");
    const upstreams = /^\s*reverse_proxy ((?:127\.0\.0\.1:\d+ ?)+) \{$/mu.exec(caddy)?.[1]?.trim().split(" ") ?? [];
    expect(upstreams).toEqual([`127.0.0.1:${A.uiPort}`, `127.0.0.1:${B.uiPort}`]);
    const uiOverlay = envOf("deploy/vps/env/releases/ui.env.example");
    const apiOverlay = envOf("deploy/vps/env/releases/api.env.example");
    expect(uiOverlay.get("PORT")).toBe(A.uiPort);
    expect(apiOverlay.get("API_PORT")).toBe(A.apiPort);
    expect(new URL(uiOverlay.get("DIALECTICAL_API_BASE") ?? "http://x").port).toBe(apiOverlay.get("API_PORT"));
    expect(envOf("deploy/vps/env/api.env.example").get("API_PORT")).toBe(A.apiPort);
    expect(envOf("deploy/vps/env/ui.env.example").get("DIALECTICAL_API_BASE")).toBe(`http://127.0.0.1:${A.apiPort}`);
    for (const port of [A.uiPort, B.uiPort, A.apiPort, B.apiPort].map(Number)) {
      expect(Number.isInteger(port) && port >= 1 && port <= 511, String(port)).toBe(true);
      expect(FETCH_BAD_PORTS, String(port)).not.toContain(port);
    }
  });
});

describe("NV-55: only the website and API units hold CAP_NET_BIND_SERVICE, each limited to its own two ports", () => {
  it("pins the capability and its bound in both units, and no other kit unit names it", async () => {
    const common = await import("../../deploy/" + "preview-lifecycle/v1/common.mjs") as {
      VPS_LAYOUT: { slots: Record<"A" | "B", { uiPort: string; apiPort: string }> };
    };
    const { A, B } = common.VPS_LAYOUT.slots;
    for (const [unit, from, to] of [
      ["deploy/vps/systemd/debateai-ui@.service", A.uiPort, B.uiPort],
      ["deploy/vps/systemd/debateai-api@.service", A.apiPort, B.apiPort]
    ] as const) {
      const lines = configLines(read(unit));
      for (const line of [
        "CapabilityBoundingSet=CAP_NET_BIND_SERVICE", "AmbientCapabilities=CAP_NET_BIND_SERVICE",
        `SocketBindAllow=tcp:${from}-${to}`, "SocketBindDeny=tcp:1-1023", "SocketBindDeny=udp:1-1023"
      ]) expect(lines, `${unit}: ${line}`).toContain(line);
      expect(Number(to) - Number(from), unit).toBe(1);
    }
    const runner = configLines(read("deploy/vps/systemd/debateai-runner@.service"));
    expect(runner).toContain("CapabilityBoundingSet=");
    expect(runner).toContain("AmbientCapabilities=");
    expect(runner.filter((line) => /^(CapabilityBoundingSet|AmbientCapabilities)=/u.test(line))).toEqual(["CapabilityBoundingSet=", "AmbientCapabilities="]);
    for (const name of readdirSync(resolve(engineRoot, "deploy/vps/systemd"))) {
      if (name === "debateai-ui@.service" || name === "debateai-api@.service") continue;
      expect(read(`deploy/vps/systemd/${name}`), name).not.toContain("CAP_NET_BIND_SERVICE");
    }
  });
});

describe("NV-55: the host checks and the sysctl pin", () => {
  it("ships the sysctl file and README §2 installs it, requires the BPF framework, probes the bound and checks file capabilities", () => {
    expect(configLines(read("deploy/vps/sysctl.d/99-zz-debateai-reserved-ports.conf"))).toEqual(["net.ipv4.ip_unprivileged_port_start = 1024"]);
    const readme = read("deploy/vps/README.md");
    for (const needle of [
      "install -m 0644 /opt/debateai/dialectical-engine/deploy/vps/sysctl.d/99-zz-debateai-reserved-ports.conf /etc/sysctl.d/ && sysctl -p /etc/sysctl.d/99-zz-debateai-reserved-ports.conf",
      "systemctl --version | grep -q -- '+BPF_FRAMEWORK'",
      "-p SocketBindAllow=tcp:483",
      "P 483; P 484",
      "command -v getcap >/dev/null || echo GETCAP_MISSING",
      "getcap -r / 2>/dev/null | grep -i cap_net_bind_service",
      "setcap -r /usr/bin/caddy"
    ]) expect(readme, needle).toContain(needle);
  });
});
