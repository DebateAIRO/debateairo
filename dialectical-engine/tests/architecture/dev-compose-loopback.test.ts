// tests/architecture/dev-compose-loopback.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const compose = readFileSync(resolve(import.meta.dirname, "../../compose.dev.yaml"), "utf8");

function publishedPorts(): string[] {
  const ports: string[] = [];
  let inPorts = false;
  for (const line of compose.split("\n")) {
    if (/^\s{4}ports:\s*$/.test(line)) { inPorts = true; continue; }
    if (inPorts && /^\s{6}-\s*"?[^"]+"?\s*$/.test(line)) { ports.push(line.replace(/^\s*-\s*"?/, "").replace(/"?\s*$/, "")); continue; }
    if (inPorts && !/^\s{6}/.test(line)) inPorts = false;
  }
  return ports;
}

describe("compose.dev.yaml publishes only on loopback (F-04)", () => {
  it("prefixes every published port with 127.0.0.1", () => {
    const ports = publishedPorts();
    expect(ports.length).toBeGreaterThanOrEqual(4); // postgres, hatchet 8888, hatchet 7077, vllm
    expect(ports.filter((port) => !port.startsWith("127.0.0.1:"))).toEqual([]);
  });
});

describe("compose.dev.yaml takes every service credential from dev key custody (L7-F3, L7-F4)", () => {
  it("sets the hatchet admin login by substitution and never ships the seeded default", () => {
    expect(compose).toMatch(/^ {6}ADMIN_EMAIL: \$\{HATCHET_ADMIN_EMAIL:\?[^}]+\}$/mu);
    expect(compose).toMatch(/^ {6}ADMIN_PASSWORD: \$\{HATCHET_ADMIN_PASSWORD:\?[^}]+\}$/mu);
    expect(compose).not.toContain("Admin123");
    expect(compose).not.toContain("admin@example.com");
  });

  it("authenticates vllm with an api key taken from custody", () => {
    expect(compose).toContain("--api-key");
    expect(compose).toMatch(/\$\{VLLM_API_KEY:\?[^}]+\}/u);
  });

  it("refuses network_mode: host for every service", () => {
    expect(compose).not.toMatch(/^\s*network_mode:\s*["']?host["']?\s*$/mu);
  });
});
