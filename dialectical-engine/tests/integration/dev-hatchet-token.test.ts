import { Buffer } from "node:buffer";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDevelopmentHatchetTokenOperations,
  DevelopmentHatchetTokenError,
  provisionDevelopmentHatchetToken,
  type DevelopmentHatchetTokenOperations
} from "../../apps/runner/src/dev-hatchet-token.js";
import { SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE } from "../../apps/runner/src/dev-auth-stack-profile.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN_VALUE_MARKER = "dev-hatchet-secret-value";
const fixtureRoots: string[] = [];

function tokenFor(overrides: Readonly<Record<string, unknown>> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: "local" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    aud: "http://localhost:8888",
    exp: 4_102_444_800,
    grpc_broadcast_address: "localhost:7077",
    iat: 1_787_750_000,
    iss: "http://localhost:8888",
    server_url: "http://localhost:8888",
    sub: TENANT_ID,
    token_id: TOKEN_ID,
    marker: TOKEN_VALUE_MARKER,
    ...overrides
  })).toString("base64url");
  return `${header}.${payload}.signature`;
}

async function fixture(): Promise<Readonly<{
  repositoryRoot: string;
  custodyRoot: string;
  tokenFilePath: string;
}>> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-dev-hatchet-"));
  fixtureRoots.push(repositoryRoot);
  const localRoot = join(repositoryRoot, ".local");
  const custodyRoot = join(localRoot, "dev-auth");
  await mkdir(localRoot, { mode: 0o700 });
  await mkdir(custodyRoot, { mode: 0o700 });
  return Object.freeze({
    repositoryRoot,
    custodyRoot,
    tokenFilePath: join(custodyRoot, "hatchet.env")
  });
}

function operations(token: string = tokenFor()): DevelopmentHatchetTokenOperations & Readonly<{
  issueToken: ReturnType<typeof vi.fn>;
  attestToken: ReturnType<typeof vi.fn>;
  revokeToken: ReturnType<typeof vi.fn>;
}> {
  return {
    revokeToken: vi.fn(async () => undefined),
    issueToken: vi.fn(async () => token),
    attestToken: vi.fn(async (candidate: string, tenantId: string) => {
      expect(candidate).toBe(token);
      expect(tenantId).toBe(TENANT_ID);
    })
  };
}

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("DEV-10A local Hatchet token custody", () => {
  it("issues, live-attests, and atomically publishes one private token without returning it", async () => {
    const test = await fixture();
    const authority = operations();
    const receipt = await provisionDevelopmentHatchetToken({
      repositoryRoot: test.repositoryRoot,
      operations: authority
    });

    expect(receipt).toEqual({ reused: false, authority: "ATTESTED", workflowApi: "REACHABLE" });
    expect(JSON.stringify(receipt)).not.toContain(TOKEN_VALUE_MARKER);
    expect(authority.issueToken).toHaveBeenCalledTimes(1);
    expect(authority.attestToken).toHaveBeenCalledTimes(1);
    expect(await readFile(test.tokenFilePath, "utf8")).toBe(
      `HATCHET_CLIENT_TOKEN=${tokenFor()}\n`
    );
    const metadata = await lstat(test.tokenFilePath);
    expect(metadata.mode & 0o777).toBe(0o600);
    expect(metadata.nlink).toBe(1);
  });

  it("serializes concurrent first use and reuses only the live-attested existing token", async () => {
    const test = await fixture();
    const authority = operations();
    const receipts = await Promise.all(Array.from({ length: 4 }, () =>
      provisionDevelopmentHatchetToken({
        repositoryRoot: test.repositoryRoot,
        operations: authority
      })
    ));

    expect(receipts.filter(({ reused }) => !reused)).toHaveLength(1);
    expect(receipts.filter(({ reused }) => reused)).toHaveLength(3);
    expect(authority.issueToken).toHaveBeenCalledTimes(1);
    expect(authority.attestToken).toHaveBeenCalledTimes(4);
    await expect(provisionDevelopmentHatchetToken({
      repositoryRoot: test.repositoryRoot,
      operations: authority
    })).resolves.toEqual({ reused: true, authority: "ATTESTED", workflowApi: "REACHABLE" });
    expect(authority.issueToken).toHaveBeenCalledTimes(1);
  });

  it("refuses unsafe custody and foreign or malformed token authority before attestation", async () => {
    const unsafe = await fixture();
    await writeFile(unsafe.tokenFilePath, `HATCHET_CLIENT_TOKEN=${tokenFor()}\n`, { mode: 0o600 });
    await chmod(unsafe.tokenFilePath, 0o644);
    await expect(provisionDevelopmentHatchetToken({
      repositoryRoot: unsafe.repositoryRoot,
      operations: operations()
    })).rejects.toThrow("DEV_HATCHET_TOKEN_CUSTODY_INVALID");

    const hardLinked = await fixture();
    await writeFile(hardLinked.tokenFilePath, `HATCHET_CLIENT_TOKEN=${tokenFor()}\n`, { mode: 0o600 });
    await link(hardLinked.tokenFilePath, join(hardLinked.custodyRoot, "hatchet-copy.env"));
    await expect(provisionDevelopmentHatchetToken({
      repositoryRoot: hardLinked.repositoryRoot,
      operations: operations()
    })).rejects.toThrow("DEV_HATCHET_TOKEN_CUSTODY_INVALID");

    for (const token of [
      "not-a-jwt",
      tokenFor({ server_url: "http://foreign.example:8888" }),
      tokenFor({ grpc_broadcast_address: "foreign.example:7077" }),
      tokenFor({ sub: "caller-chosen-tenant" }),
      tokenFor({ aud: "http://foreign.example:8888" }),
      tokenFor({ iss: "http://foreign.example:8888" })
    ]) {
      const malformed = await fixture();
      const authority = operations(token);
      await expect(provisionDevelopmentHatchetToken({
        repositoryRoot: malformed.repositoryRoot,
        operations: authority
      })).rejects.toThrow("DEV_HATCHET_TOKEN_INVALID");
      expect(authority.attestToken).not.toHaveBeenCalled();
      await expect(readFile(malformed.tokenFilePath, "utf8")).rejects.toThrow();
    }
  });

  it("publishes nothing when live tenant or workflow reachability attestation fails", async () => {
    const test = await fixture();
    const authority = operations();
    authority.attestToken.mockRejectedValueOnce(new Error("unreachable secret-bearing endpoint"));

    await expect(provisionDevelopmentHatchetToken({
      repositoryRoot: test.repositoryRoot,
      operations: authority
    })).rejects.toThrow("DEV_HATCHET_TOKEN_ATTESTATION_FAILED");
    expect(authority.issueToken).toHaveBeenCalledTimes(1);
    expect(authority.attestToken).toHaveBeenCalledTimes(1);
    await expect(readFile(test.tokenFilePath, "utf8")).rejects.toThrow();
  });

  it("rotates by revoking the existing token before minting its replacement (L7-F5)", async () => {
    const test = await fixture();
    await provisionDevelopmentHatchetToken({
      repositoryRoot: test.repositoryRoot,
      operations: operations()
    });

    const replacement = tokenFor({ token_id: "33333333-3333-4333-8333-333333333333" });
    const rotating = operations(replacement);
    const receipt = await provisionDevelopmentHatchetToken({
      repositoryRoot: test.repositoryRoot,
      operations: rotating,
      rotate: true
    });

    expect(receipt).toEqual({ reused: false, authority: "ATTESTED", workflowApi: "REACHABLE" });
    expect(rotating.revokeToken).toHaveBeenCalledTimes(1);
    expect(rotating.revokeToken).toHaveBeenCalledWith(TOKEN_ID);
    expect(rotating.issueToken).toHaveBeenCalledTimes(1);
    expect(await readFile(test.tokenFilePath, "utf8"))
      .toBe(`HATCHET_CLIENT_TOKEN=${replacement}\n`);
    const metadata = await lstat(test.tokenFilePath);
    expect(metadata.mode & 0o777).toBe(0o600);
    expect(metadata.nlink).toBe(1);
  });

  it("publishes no replacement when the revoke step fails (L7-F5)", async () => {
    const test = await fixture();
    await provisionDevelopmentHatchetToken({
      repositoryRoot: test.repositoryRoot,
      operations: operations()
    });
    const rotating = operations(tokenFor({ token_id: "33333333-3333-4333-8333-333333333333" }));
    rotating.revokeToken.mockRejectedValueOnce(new Error("secret admin failure"));

    await expect(provisionDevelopmentHatchetToken({
      repositoryRoot: test.repositoryRoot,
      operations: rotating,
      rotate: true
    })).rejects.toThrow("DEV_HATCHET_TOKEN_REVOKE_FAILED");
    expect(rotating.issueToken).not.toHaveBeenCalled();
    expect(await readFile(test.tokenFilePath, "utf8")).toBe(`HATCHET_CLIENT_TOKEN=${tokenFor()}\n`);
  });

  it("refuses a token inside the expiry floor and names the rotation command (L7-F5)", async () => {
    const test = await fixture();
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const authority = operations(tokenFor({
      iat: nowSeconds - 60,
      exp: nowSeconds + 10 * 24 * 60 * 60
    }));

    const failure: unknown = await provisionDevelopmentHatchetToken({
      repositoryRoot: test.repositoryRoot,
      operations: authority
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DevelopmentHatchetTokenError);
    expect((failure as DevelopmentHatchetTokenError).message).toBe("DEV_HATCHET_TOKEN_EXPIRING");
    expect((failure as DevelopmentHatchetTokenError).detail)
      .toContain("pnpm dev:auth:provision-hatchet-token --rotate");
    expect(authority.attestToken).not.toHaveBeenCalled();
    await expect(readFile(test.tokenFilePath, "utf8")).rejects.toThrow();
  });

  it("accepts only the selected support-preview Hatchet authority", async () => {
    const test = await fixture();
    const previewToken = tokenFor({
      aud: "http://localhost:8988",
      iss: "http://localhost:8988",
      server_url: "http://localhost:8988",
      grpc_broadcast_address: "localhost:7177"
    });
    await expect(provisionDevelopmentHatchetToken({
      repositoryRoot: test.repositoryRoot,
      operations: operations(previewToken),
      profile: SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE
    })).resolves.toMatchObject({ authority: "ATTESTED" });
  });

  /**
   * SYNC3 (review Minor 2). dev's stack profiles made compose's project name and
   * ports a per-profile environment; L7-F5's revoke was written before them and
   * ran compose with none of it, so on the support-preview stack it would have
   * revoked on the DEFAULT stack's hatchet-lite while the issue ran on the
   * preview's. Latent today — the only rotating command (the CLI) uses the
   * default profile and the stack never rotates — so it is pinned here, against
   * the real operations factory, with a recording stand-in for `docker`.
   */
  it("revokes on the same profile's hatchet-lite that it issues on", async () => {
    const directory = await mkdtemp(join(tmpdir(), "debateai-dev-hatchet-revoke-"));
    fixtureRoots.push(directory);
    const record = join(directory, "docker-calls.txt");
    const docker = join(directory, "docker");
    const quoted = record.replaceAll("'", "'\\''");
    await writeFile(docker, [
      "#!/bin/sh",
      'if [ "$1" = "info" ]; then printf \'27.0.1\\n\'; exit 0; fi',
      `printf 'project=%s api=%s grpc=%s postgres=%s | %s\\n' "$DEBATEAI_DEV_COMPOSE_PROJECT_NAME" "$DEBATEAI_DEV_HATCHET_API_PORT" "$DEBATEAI_DEV_HATCHET_GRPC_PORT" "$DEBATEAI_DEV_POSTGRES_PORT" "$*" >> '${quoted}'`,
      'case " $* " in *" ps "*) printf \'hatchet-lite\\n\' ;; *) printf \'issued\\n\' ;; esac'
    ].join("\n") + "\n", { mode: 0o700 });
    await chmod(docker, 0o700);
    const operations = createDevelopmentHatchetTokenOperations(
      directory,
      { PATH: "", DEBATEAI_DEV_DOCKER_BIN: docker },
      SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE
    );

    await operations.issueToken();
    await operations.revokeToken("33333333-3333-4333-8333-333333333333");

    const calls = (await readFile(record, "utf8")).trim().split("\n");
    const preview = "project=debateai-v3-support-preview api=8988 grpc=7177 postgres=55433 | ";
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain(`${preview}compose`);
    expect(calls[0]).toContain("ps --status running --services");
    expect(calls[1]).toContain(`${preview}compose`);
    expect(calls[1]).toContain("exec -T hatchet-lite ./hatchet-admin --config /config token create");
    expect(calls[2]).toContain(`${preview}compose`);
    expect(calls[2]).toContain(
      "exec -T hatchet-lite ./hatchet-admin --config /config token revoke --id 33333333-3333-4333-8333-333333333333"
    );
  });

  it("keeps token values out of the CLI and uses the supported pinned-image admin path", async () => {
    const [packageSource, cliSource, implementationSource] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("apps/runner/src/dev-hatchet-token-cli.ts", "utf8"),
      readFile("apps/runner/src/dev-hatchet-token.ts", "utf8")
    ]);
    expect(JSON.parse(packageSource).scripts["dev:auth:provision-hatchet-token"])
      .toBe("tsx apps/runner/src/dev-hatchet-token-cli.ts");
    expect(cliSource).not.toMatch(/HATCHET_CLIENT_TOKEN|token_id|console\.log\([^)]*token/iu);
    expect(implementationSource).toContain(
      '"./hatchet-admin", "--config", "/config", "token", "create"'
    );
    expect(implementationSource).toContain('"--name", "debateai-local-auth"');
    expect(implementationSource).toContain('"--expiresIn", "8760h"');
    expect(implementationSource).toContain("client.tenant.get()");
    expect(implementationSource).toContain("client.workflows.list()");
    expect(implementationSource).not.toMatch(/INSERT\s+INTO|UPDATE\s+.*token/iu);
    expect(implementationSource).not.toContain("process.env");
    expect(cliSource).toContain("loadDevelopmentCommandEnvironment()");
  });
});
