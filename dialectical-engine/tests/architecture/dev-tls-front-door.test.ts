import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("DEV-07 local HTTPS front-door contract", () => {
  it("pins exact loopback endpoints and never installs or weakens certificate trust", () => {
    const certificate = readFileSync("deploy/dev-auth/create-local-certificate.mjs", "utf8");
    const frontDoor = readFileSync("deploy/dev-auth/tls-front-door.mjs", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["dev:auth:generate-tls"]).toBe(
      "node deploy/dev-auth/create-local-certificate.mjs"
    );
    expect(packageJson.scripts["dev:auth:tls-front-door"]).toBe(
      "node deploy/dev-auth/tls-front-door.mjs"
    );
    expect(certificate).toContain('"localhost", "127.0.0.1", "::1"');
    expect(certificate).not.toContain('"-install"');
    expect(certificate).not.toContain("NODE_TLS_REJECT_UNAUTHORIZED");
    expect(frontDoor).toContain('listenHost: "127.0.0.1"');
    expect(frontDoor).toContain("listenPort: 3000");
    expect(frontDoor).toContain('upstreamHost: "127.0.0.1"');
    expect(frontDoor).toContain("upstreamPort: 3001");
    expect(frontDoor).not.toContain("rejectUnauthorized: false");
    expect(frontDoor).not.toContain("NODE_TLS_REJECT_UNAUTHORIZED");
    expect(frontDoor).not.toMatch(/createServer\s*\(\s*\([^)]*\)\s*=>/);
  });

  it("keeps PUBLIC_APP_URL exact and documents manual trust without an HTTP fallback", () => {
    const topology = readFileSync(
      "docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.md",
      "utf8"
    );
    const runbook = readFileSync("deploy/dev-auth/README.md", "utf8");
    expect(topology).toContain("`https://localhost:3000`");
    expect(topology).toContain("Plain `http://localhost:3000` is not a fallback");
    expect(runbook).toContain("mkcert -install");
    expect(runbook).toContain("manual");
    expect(runbook).toContain("https://localhost:3000");
    expect(runbook).not.toContain("NODE_TLS_REJECT_UNAUTHORIZED=0");
  });
});
