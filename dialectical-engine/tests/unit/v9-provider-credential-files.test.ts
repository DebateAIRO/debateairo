import { createServer, type Server } from "node:http";
import { chmodSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  configureCustodyGroup,
  readCustodyAuthorizationHeader
} from "../../packages/crypto/src/index.js";
import {
  parseDevelopmentProviderPanelTargets
} from "../../apps/runner/src/dev-provider-panel.js";
import {
  OpenAICompatibleProviderGateway,
  assertDeploymentProviderTargets,
  parseProviderDiscoveryTargets,
  resolveProviderTargetCredentials
} from "../../packages/providers/src/index.js";
import { framedFixturePacket } from "../support/framed-packet.js";

/**
 * V-9(2) and V-9(3), task 10b/10c.
 *
 * (2) A hosted provider credential leaves `PROVIDER_DISCOVERY_TARGETS_JSON` —
 *     where it rides in an environment variable today, readable from
 *     `/proc/<pid>/environ` and from anything that dumps the unit file — for a
 *     key FILE read under the SAME custody contract as every other secret file
 *     (V-19): owner-only, or the custody group. One file per vendor per
 *     environment. Never logged, never on a command line, never in an error.
 *
 * (3) Vendors are configuration, not code: a new OpenAI-compatible vendor is a
 *     target entry, a key file and the register's configured-providers row.
 */

const CREDENTIAL = "Bearer t10-fixture-token-0123456789";

const configured = (refs: readonly string[]) =>
  refs.map((providerRef, index) => ({ providerRef, maker: `maker-${index + 1}` }));

function parse(rows: readonly Readonly<Record<string, unknown>>[]) {
  return parseProviderDiscoveryTargets(
    JSON.stringify(rows),
    configured(rows.map((row) => String(row.provider_ref)))
  );
}

/** A 0600 file inside a 0700 directory — the single-owner custody shape. */
function custodyRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "t10-custody-"));
  chmodSync(root, 0o700);
  return root;
}

function writeCredential(root: string, name: string, contents: string, mode = 0o600): string {
  const path = join(root, name);
  writeFileSync(path, contents);
  chmodSync(path, mode);
  return path;
}

const roots: string[] = [];
function freshRoot(): string {
  const root = custodyRoot();
  roots.push(root);
  return root;
}
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("V-9 a target names a credential FILE (task 10b)", () => {
  it("carries authorization_file through the parser", () => {
    const [target] = parse([{
      provider_ref: "vendor-a",
      base_url: "https://api.vendor-a.example/v1",
      model: "vendor-a-large",
      authorization_file: "/etc/debateai/runner/providers/vendor-a.header"
    }]);
    expect(target).toMatchObject({
      providerRef: "vendor-a",
      baseUrl: "https://api.vendor-a.example/v1",
      authorizationFile: "/etc/debateai/runner/providers/vendor-a.header"
    });
    expect(target?.authorizationHeader).toBeUndefined();
  });

  it("refuses a target that names both a file and an inline credential", () => {
    expect(() => parse([{
      provider_ref: "vendor-a",
      base_url: "https://api.vendor-a.example/v1",
      model: "vendor-a-large",
      authorization_header: CREDENTIAL,
      authorization_file: "/etc/debateai/runner/providers/vendor-a.header"
    }])).toThrowError(new TypeError("PROVIDER_DISCOVERY_AUTHORIZATION_CONFLICT"));
  });

  it("refuses a credential path that is not absolute, empty or untrimmed", () => {
    for (const authorization_file of ["providers/vendor-a.header", "", "  ", " /etc/x ", "./x"]) {
      expect(() => parse([{
        provider_ref: "vendor-a",
        base_url: "https://api.vendor-a.example/v1",
        model: "vendor-a-large",
        authorization_file
      }])).toThrowError(new TypeError("PROVIDER_DISCOVERY_AUTHORIZATION_FILE_INVALID"));
    }
  });

  it("admits a credential-file target in hosted mode, where an inline one is refused", () => {
    const withFile = parse([{
      provider_ref: "vendor-a",
      base_url: "https://api.vendor-a.example/v1",
      model: "vendor-a-large",
      authorization_file: "/etc/debateai/runner/providers/vendor-a.header"
    }]);
    expect(() => assertDeploymentProviderTargets(withFile, {
      mode: "hosted", nodeEnv: "production"
    })).not.toThrow();
  });
});

describe("V-9 the credential is loaded through the custody contract (task 10b)", () => {
  it("reads a 0600 credential in a 0700 directory and returns the header", () => {
    const root = freshRoot();
    expect(readCustodyAuthorizationHeader(writeCredential(root, "a.header", CREDENTIAL)))
      .toBe(CREDENTIAL);
    expect(readCustodyAuthorizationHeader(writeCredential(root, "b.header", `${CREDENTIAL}\n`)))
      .toBe(CREDENTIAL);
  });

  it("refuses exactly what the key-file contract refuses", () => {
    const root = freshRoot();
    expect(() => readCustodyAuthorizationHeader(writeCredential(root, "group.header", CREDENTIAL, 0o640)))
      .toThrowError(expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" }));
    expect(() => readCustodyAuthorizationHeader(writeCredential(root, "world.header", CREDENTIAL, 0o644)))
      .toThrowError(expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" }));
    const real = writeCredential(root, "real.header", CREDENTIAL);
    const link = join(root, "link.header");
    symlinkSync(real, link);
    expect(() => readCustodyAuthorizationHeader(link))
      .toThrowError(expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" }));
    // Review finding 2: a file nobody provisioned is NOT "this file is not safe
    // to trust", and it is certainly not a KEK. It keeps its own honest name.
    expect(() => readCustodyAuthorizationHeader(join(root, "absent.header")))
      .toThrowError(expect.objectContaining({ code: "PROVIDER_CREDENTIAL_FILE_ABSENT" }));
    const open = mkdtempSync(join(tmpdir(), "t10-open-"));
    roots.push(open);
    chmodSync(open, 0o755);
    expect(() => readCustodyAuthorizationHeader(writeCredential(open, "c.header", CREDENTIAL)))
      .toThrowError(expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" }));
  });

  it("refuses a credential that is not one printable header line", () => {
    const root = freshRoot();
    const refused = [
      ["empty", ""],
      ["newline-only", "\n"],
      ["blank", "   \n"],
      ["two-lines", "Bearer one\nBearer two\n"],
      ["embedded-cr", "Bearer one\rBearer two"],
      ["leading-space", " Bearer one"],
      ["trailing-space", "Bearer one "],
      ["control-byte", `Bearer one${String.fromCharCode(0)}two`],
      ["non-ascii", "Bearer é"],
      ["too-long", `Bearer ${"a".repeat(5_000)}`]
    ] as const;
    for (const [name, contents] of refused) {
      expect(() => readCustodyAuthorizationHeader(writeCredential(root, `${name}.header`, contents)))
        .toThrowError(expect.objectContaining({ code: "PROVIDER_CREDENTIAL_FILE_INVALID" }));
    }
  });

  it("names neither the path nor the credential in any refusal", () => {
    const root = freshRoot();
    const path = writeCredential(root, "leaky.header", CREDENTIAL, 0o644);
    const caught = (() => {
      try {
        readCustodyAuthorizationHeader(path);
        return null;
      } catch (error) {
        return error as Error;
      }
    })();
    const rendered = JSON.stringify(caught, Object.getOwnPropertyNames(caught ?? {}));
    expect(rendered).not.toContain(CREDENTIAL);
    expect(rendered).not.toContain("t10-fixture-token");
    expect(rendered).not.toContain(path);
    expect(rendered).not.toContain(root);
  });

  /**
   * Review finding 5. The V-19 custody group is the ONE-inode variant §11 offers
   * the owner: `0640` with the group's gid inside a `0750` directory with the
   * same gid. The contract is shared with every key file, so it must admit a
   * credential file too — and until this case existed that was assumed, not
   * measured (the 0640 case above runs with NO group configured, which is the
   * opposite arm).
   */
  it("admits the one-inode custody-group shape when the group is configured", () => {
    const root = mkdtempSync(join(tmpdir(), "t10-group-"));
    roots.push(root);
    chmodSync(root, 0o750);
    const path = writeCredential(root, "shared.header", CREDENTIAL, 0o640);
    // The group the tree actually carries on this host — no group needs creating,
    // and the gid form is what a host without a POSIX group database would use.
    const gid = statSync(root).gid;
    try {
      configureCustodyGroup(String(gid));
      expect(readCustodyAuthorizationHeader(path)).toBe(CREDENTIAL);
    } finally {
      configureCustodyGroup(undefined);
    }
    // ...and the same file refuses again the moment the group is not configured.
    expect(() => readCustodyAuthorizationHeader(path))
      .toThrowError(expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" }));
  });

  it("zeroes the buffer it read the credential into", async () => {
    const source = await readFile(
      new URL("../../packages/crypto/src/index.ts", import.meta.url), "utf8"
    );
    const body = source.slice(source.indexOf("export function readCustodyAuthorizationHeader"));
    expect(body.slice(0, body.indexOf("\n}\n"))).toContain("material.fill(0)");
  });
});

describe("V-9 the target set resolves its credentials once, in memory (task 10b)", () => {
  it("replaces the file with the header and keeps the path out of the resolved target", () => {
    const declared = parse([{
      provider_ref: "vendor-a",
      base_url: "https://api.vendor-a.example/v1",
      model: "vendor-a-large",
      authorization_file: "/etc/debateai/runner/providers/vendor-a.header"
    }]);
    const read = vi.fn(() => CREDENTIAL);
    const [resolved] = resolveProviderTargetCredentials(declared, read);
    expect(read).toHaveBeenCalledExactlyOnceWith("/etc/debateai/runner/providers/vendor-a.header");
    expect(resolved?.authorizationHeader).toBe(CREDENTIAL);
    expect(Object.hasOwn(resolved ?? {}, "authorizationFile")).toBe(false);
    expect(resolved).toMatchObject({
      providerRef: "vendor-a", maker: "maker-1", model: "vendor-a-large"
    });
  });

  it("leaves a target with no credential, and an inline one, exactly as declared", () => {
    const declared = parse([
      { provider_ref: "relay", base_url: "http://127.0.0.1:8791/v1", model: "relay-model" },
      {
        provider_ref: "inline",
        base_url: "https://api.vendor-b.example/v1",
        model: "vendor-b",
        authorization_header: CREDENTIAL
      }
    ]);
    const read = vi.fn(() => CREDENTIAL);
    expect(resolveProviderTargetCredentials(declared, read)).toEqual(declared);
    expect(read).not.toHaveBeenCalled();
  });

  it("names the provider and the underlying code, never the path or the credential", () => {
    const declared = parse([{
      provider_ref: "vendor-a",
      base_url: "https://api.vendor-a.example/v1",
      model: "vendor-a-large",
      authorization_file: "/etc/debateai/runner/providers/vendor-a.header"
    }]);
    expect(() => resolveProviderTargetCredentials(declared, () => {
      throw Object.assign(new Error("SECRET_CUSTODY_INVALID"), { code: "SECRET_CUSTODY_INVALID" });
    })).toThrowError(new TypeError(
      "PROVIDER_AUTHORIZATION_FILE_UNUSABLE:vendor-a:SECRET_CUSTODY_INVALID"
    ));
    // An unrecognised failure is reported under a bounded name, never by
    // carrying the thrown message — which could hold the path or the file.
    expect(() => resolveProviderTargetCredentials(declared, () => {
      throw new Error(`/private/var/secret holds ${CREDENTIAL}`);
    })).toThrowError(new TypeError("PROVIDER_AUTHORIZATION_FILE_UNUSABLE:vendor-a:UNKNOWN"));
    // A reader that returns something unusable is refused at this boundary too.
    for (const returned of ["", "  ", "Bearer one\nBearer two", " Bearer one"]) {
      expect(() => resolveProviderTargetCredentials(declared, () => returned))
        .toThrowError(new TypeError(
          "PROVIDER_AUTHORIZATION_FILE_UNUSABLE:vendor-a:PROVIDER_CREDENTIAL_FILE_INVALID"
        ));
    }
  });

  /**
   * Review finding 2, at the boundary: "you never provisioned this" is a
   * different operator action from "this file is not safe to trust", exactly as
   * `KEK_UNRESOLVED` is a different action from `KEK_CUSTODY_INVALID`. It gets
   * its own top-level refusal rather than a shared `UNUSABLE` bucket.
   */
  it("reports an absent credential file under its own name", () => {
    const declared = parse([{
      provider_ref: "vendor-a",
      base_url: "https://api.vendor-a.example/v1",
      model: "vendor-a-large",
      authorization_file: "/etc/debateai/runner/providers/vendor-a.header"
    }]);
    expect(() => resolveProviderTargetCredentials(declared, () => {
      throw Object.assign(new Error("PROVIDER_CREDENTIAL_FILE_ABSENT"), {
        code: "PROVIDER_CREDENTIAL_FILE_ABSENT"
      });
    })).toThrowError(new TypeError("PROVIDER_AUTHORIZATION_FILE_ABSENT:vendor-a"));
    // It still names no path: the provider ref is the whole message.
    const caught = (() => {
      try {
        resolveProviderTargetCredentials(declared, () => {
          throw Object.assign(new Error("x"), { code: "PROVIDER_CREDENTIAL_FILE_ABSENT" });
        });
        return null;
      } catch (error) {
        return error as Error;
      }
    })();
    expect(caught?.message).not.toContain("/etc/debateai");
  });
});

/**
 * Review finding 3. `authorization_file` is understood by the shared parser but
 * honoured only in the two shipped composition roots. The local development
 * stack reads `authorizationHeader` alone, so a local user who wrote
 * `authorization_file` would have got an UNAUTHENTICATED call and an ABSENT
 * probe with no explanation. It refuses loudly instead, naming the field.
 */
describe("V-9 the local dev stack refuses a credential file it cannot honour", () => {
  // The full development roster, so the refusal under test is the credential
  // file and not the set-mismatch that guards this panel.
  // A healthy relay must carry an inline credential in this stack, so the whole
  // roster is healthy and credentialled and only the FIRST entry differs. The
  // refusal under test is then the credential file, not the panel's set guards.
  const roster = (first: Readonly<Record<string, unknown>>) => JSON.stringify([
    {
      provider_ref: "development:codex-cli",
      base_url: "http://127.0.0.1:8791/v1",
      model: "gpt-5-codex",
      ...first
    },
    {
      provider_ref: "development:claude-cli",
      base_url: "http://127.0.0.1:8792/v1",
      model: "claude-opus",
      authorization_header: "Bearer local-relay-claude"
    },
    {
      provider_ref: "development:grok-cli",
      base_url: "http://127.0.0.1:8793/v1",
      model: "grok-4",
      authorization_header: "Bearer local-relay-grok"
    }
  ]);

  it("refuses a dev panel target that names a credential file", () => {
    expect(() => parseDevelopmentProviderPanelTargets(
      roster({ authorization_file: "/home/somebody/.debateai/codex.header" })
    )).toThrowError(new TypeError("DEV_CLI_PROVIDER_PANEL_AUTHORIZATION_FILE_UNSUPPORTED"));
  });

  it("still accepts the local stack's own inline relay credentials", () => {
    expect(() => parseDevelopmentProviderPanelTargets(
      roster({ authorization_header: "Bearer local-relay-codex" })
    )).not.toThrow();
  });

  it("names the code in the dev stack's own refusal vocabulary", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/dev-auth-stack.ts", import.meta.url), "utf8"
    );
    expect(source).toContain("DEV_CLI_PROVIDER_PANEL_AUTHORIZATION_FILE_UNSUPPORTED");
  });
});

/**
 * Re-review finding 1. The kit's refusal table had gone stale within one round:
 * it still mapped an absent credential file to the KEK code the translation had
 * just removed. A table an operator reads during an incident may not drift, so
 * the codes are read OUT OF THE SOURCE and every one of them must appear in §11.
 */
describe("V-9 the kit names every refusal the credential path can emit", () => {
  it("lists each code the resolver can produce, read from the source", async () => {
    const providers = await readFile(
      new URL("../../packages/providers/src/index.ts", import.meta.url), "utf8"
    );
    const closedSet = providers.slice(
      providers.indexOf("const PROVIDER_CREDENTIAL_REFUSAL_CODES"),
      providers.indexOf("] as const);", providers.indexOf("const PROVIDER_CREDENTIAL_REFUSAL_CODES"))
    );
    const codes = [...closedSet.matchAll(/"([A-Z_]+)"/gu)].map((match) => match[1]!);
    expect(codes.length).toBeGreaterThan(0);
    const absent = /const PROVIDER_CREDENTIAL_ABSENT_CODE = "([A-Z_]+)"/u.exec(providers)?.[1];
    expect(absent).toBe("PROVIDER_CREDENTIAL_FILE_ABSENT");
    const readme = await readFile(
      new URL("../../deploy/vps/README.md", import.meta.url), "utf8"
    );
    const section = readme.slice(readme.indexOf("## 11. Providers and vendors"));
    for (const code of [...codes, absent!, "PROVIDER_AUTHORIZATION_FILE_ABSENT"]) {
      expect(section, code).toContain(code);
    }
    // ...and it may no longer promise a code the credential reader cannot emit.
    expect(codes).not.toContain("KEK_UNRESOLVED");
    expect(section).not.toContain("PROVIDER_AUTHORIZATION_FILE_UNUSABLE:<ref>:KEK_UNRESOLVED");
  });

  /**
   * Re-review finding 3. `isThisMachineHost` decides on the LITERAL address in
   * the URL; it performs no name resolution, so a public name with an A record
   * of 127.0.0.1 is admitted. The comment and the kit must say that, because an
   * operator who believes otherwise will not check the hostname themselves.
   */
  it("states plainly that the check is literal, not resolved", async () => {
    const providers = await readFile(
      new URL("../../packages/providers/src/index.ts", import.meta.url), "utf8"
    );
    expect(providers).not.toContain("no target that resolves to THIS MACHINE");
    expect(providers).toMatch(/LITERAL address/u);
    expect(providers).toMatch(/no name resolution/u);
    const readme = await readFile(
      new URL("../../deploy/vps/README.md", import.meta.url), "utf8"
    );
    const section = readme.slice(readme.indexOf("## 11. Providers and vendors"));
    expect(section).toMatch(/real public name/u);
    expect(section).toMatch(/resolves to this machine/u);
  });
});

/**
 * Review finding 4. The one-printable-header-line rule is enforced twice on
 * purpose — once where the file is read (`@debateai/crypto`) and once at the
 * resolution boundary, where the reader is an injected seam. `@debateai/providers`
 * does not depend on `@debateai/crypto` (adding that edge would move the
 * lockfile), so the two literals are pinned EQUAL here instead of shared.
 */
describe("V-9 the header-line rule cannot drift between its two homes", () => {
  it("defines the same pattern in @debateai/crypto and @debateai/providers", async () => {
    const line = async (path: string) => {
      const source = await readFile(new URL(path, import.meta.url), "utf8");
      const found = source.split("\n").find((candidate) =>
        candidate.includes("const PRINTABLE_HEADER_LINE ="));
      expect(found, path).toBeDefined();
      return found?.trim();
    };
    const [crypto, providers] = await Promise.all([
      line("../../packages/crypto/src/index.ts"),
      line("../../packages/providers/src/index.ts")
    ]);
    expect(providers).toBe(crypto);
    expect(crypto).toContain("x20-\\x7e");
  });
});

describe("V-9 both roots resolve credentials AFTER the mode decision (task 10b)", () => {
  it("asserts the declared targets first, then resolves their files under custody", async () => {
    for (const path of ["../../apps/api/src/main.ts", "../../apps/runner/src/main.ts"]) {
      const source = await readFile(new URL(path, import.meta.url), "utf8");
      expect(source).toContain("resolveProviderTargetCredentials(");
      expect(source).toContain("readCustodyAuthorizationHeader");
      expect(source.indexOf("assertDeploymentProviderTargets("))
        .toBeLessThan(source.indexOf("resolveProviderTargetCredentials("));
    }
  });
});

/**
 * 10c. A fake OpenAI-compatible vendor, stood up on loopback, added as a NEW
 * vendor with no code at all: one row in `PROVIDER_DISCOVERY_TARGETS_JSON`, one
 * credential file, one entry in the register's configured-providers row. The
 * gateway that serves it is the built-in `openai-compatible-http` adapter.
 */
describe("V-9 a new OpenAI-compatible vendor needs no code (task 10c)", () => {
  let server: Server;
  let baseUrl: string;
  const seen: {
    authorization: string | undefined;
    model: string | undefined;
    url: string | undefined;
  }[] = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += String(chunk); });
      request.on("end", () => {
        const decoded = JSON.parse(body) as { model?: string };
        seen.push({
          authorization: request.headers.authorization,
          model: decoded.model,
          // The path the adapter actually posted to, recorded rather than
          // assumed: this vendor's server answers any route, so an unrecorded
          // URL is an unmeasured one.
          url: request.url
        });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          id: "fake-vendor-1",
          model: decoded.model,
          choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }]
        }));
      });
    });
    await new Promise<void>((resolve) => { server.listen(0, "127.0.0.1", resolve); });
    /**
     * A MULTI-SEGMENT prefix on purpose. `normalizedProviderBaseUrl` requires a
     * base path ending in `/v1`, so `/api/v1` is as lawful as `/v1` — and only a
     * gateway that appends to whatever base the target row names can answer it.
     * A bare `/v1` would be satisfied by an adapter with `/v1/chat/completions`
     * written into it, which is the one thing "vendors are configuration, not
     * code" must not be able to hide.
     */
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  });

  afterEach(() => { seen.length = 0; });

  it("reaches the new vendor with the header built from its key file", async () => {
    const root = freshRoot();
    // (1) the key file, (2) the register's configured-providers row, and
    // (3) the target entry. Nothing else, and no new adapter.
    const credentialPath = writeCredential(root, "vendor-new.header", `${CREDENTIAL}\n`);
    const registerRow = [{ providerRef: "vendor-new", maker: "maker-new" }];
    const targets = resolveProviderTargetCredentials(
      parseProviderDiscoveryTargets(JSON.stringify([{
        provider_ref: "vendor-new",
        base_url: baseUrl,
        model: "vendor-new-large",
        authorization_file: credentialPath
      }]), registerRow),
      readCustodyAuthorizationHeader
    );
    const [target] = targets;
    const gateway = new OpenAICompatibleProviderGateway({
      endpoint: target!.baseUrl,
      model: target!.model,
      maker: target!.maker,
      ...(target!.authorizationHeader === undefined
        ? {} : { authorizationHeader: target!.authorizationHeader }),
      persistRawArtifact: async () => "raw-1",
      appendLedgerEntry: async () => "ledger-1",
      assertNoOpenWriteTransaction: () => undefined
    });
    const result = await gateway.call({
      runId: null,
      subjectItemId: "item-1",
      callSiteKey: "t10c",
      role: "JUDGE",
      lane: "served",
      bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 },
      contractHash: "contract-1",
      providerRef: "vendor-new",
      // V-11 addendum, layer 1: the gateway's door refuses any packet the frame
      // builder did not make, so the vendor is reached with a REAL framed packet
      // (`tests/support/framed-packet.ts` calls `buildFramedPrompt` itself). What
      // this case measures is the credential and the target, not the packet: a
      // hand-built one measured the door instead and never left the process.
      packet: framedFixturePacket("ping")
    });
    expect(result.content).toBe("{\"ok\":true}");
    expect(result.maker).toBe("maker-new");
    expect(result.model).toBe("vendor-new-large");
    // V-9(3) on the PATH as well as the header: the vendor is reached at its own
    // configured prefix plus the adapter's one route, with no code that knows
    // this vendor exists.
    expect(seen).toEqual([{
      authorization: CREDENTIAL,
      model: "vendor-new-large",
      url: "/api/v1/chat/completions"
    }]);
  });

  it("refuses the vendor when the register row does not name it", () => {
    expect(() => parseProviderDiscoveryTargets(JSON.stringify([{
      provider_ref: "vendor-new",
      base_url: baseUrl,
      model: "vendor-new-large"
    }]), [{ providerRef: "vendor-old", maker: "maker-old" }]))
      .toThrowError(new TypeError("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH"));
  });
});
