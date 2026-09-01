import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { buildApi, type ApiOptions } from "../../apps/api/src/index.js";
import { TRUSTED_UI_PROXY_NETWORKS } from "../../apps/api/src/client-ip.js";
import {
  REGISTRATION_PUBLIC_RESPONSE,
  RESEND_PUBLIC_RESPONSE,
  type RegistrationApplication
} from "../../apps/api/src/registration.js";
import * as restoredUiRoute from "../../apps/ui/app/api/[...path]/route.js";
import { hardenIncomingProxyHeaders as hardenRestoredUiHeaders } from "../../apps/ui/trusted-client-ip.mjs";

type ProxyRoute = Readonly<{
  POST(request: Request, context: {
    readonly params: Promise<Readonly<{ path: string[] }>>;
  }): Promise<Response>;
}>;

const originalFetch = globalThis.fetch;
const originalBase = process.env.DIALECTICAL_API_BASE;

beforeEach(() => {
  process.env.DIALECTICAL_API_BASE = "http://127.0.0.1:8790";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.DIALECTICAL_API_BASE;
  else process.env.DIALECTICAL_API_BASE = originalBase;
});

function inertApplication(): ApiOptions["application"] {
  return {} as ApiOptions["application"];
}

async function observedAuthSource(input: Readonly<{
  remoteAddress: string;
  xForwardedFor?: string;
}>): Promise<string> {
  const observed: string[] = [];
  const registration: RegistrationApplication = {
    register: async (_request, source) => {
      observed.push(source.ip);
      return REGISTRATION_PUBLIC_RESPONSE;
    },
    verifyEmail: async (_request, source) => {
      observed.push(source.ip);
      return { status: "mfa_required" };
    },
    resendVerification: async (_request, source) => {
      observed.push(source.ip);
      return RESEND_PUBLIC_RESPONSE;
    }
  };
  const api = buildApi({ application: inertApplication(), registration });
  try {
    const response = await api.inject({
      method: "POST",
      url: "/v1/auth/register",
      remoteAddress: input.remoteAddress,
      ...(input.xForwardedFor === undefined
        ? {}
        : { headers: { "x-forwarded-for": input.xForwardedFor } }),
      payload: {
        email: "alice@example.test",
        password: "correct horse battery staple",
        recovery_email: "recovery@example.test",
        adult_affirmed: true
      }
    });
    expect(response.statusCode).toBe(202);
    expect(observed).toHaveLength(1);
    return observed[0]!;
  } finally {
    await api.close();
  }
}

describe("T2 API trusted-hop client address", () => {
  it("pins only the two exact single-host UI source addresses", () => {
    expect(TRUSTED_UI_PROXY_NETWORKS).toEqual(["127.0.0.1/32", "::1/128"]);
  });

  it("trusts one loopback UI hop without using trustProxy:true", async () => {
    await expect(observedAuthSource({
      remoteAddress: "127.0.0.1",
      xForwardedFor: "203.0.113.9"
    })).resolves.toBe("203.0.113.9");
  });

  it("stops at the first untrusted address in a multi-hop spoof", async () => {
    await expect(observedAuthSource({
      remoteAddress: "127.0.0.1",
      xForwardedFor: "198.51.100.250, 203.0.113.9"
    })).resolves.toBe("203.0.113.9");
  });

  it("ignores forwarding headers from a direct untrusted peer", async () => {
    await expect(observedAuthSource({
      remoteAddress: "198.51.100.44",
      xForwardedFor: "203.0.113.9"
    })).resolves.toBe("198.51.100.44");
    // `127.0.0.0/8` would be a materially broader trust decision than the
    // ruled one-process hop. Even another loopback address is not that hop.
    await expect(observedAuthSource({
      remoteAddress: "127.0.0.2",
      xForwardedFor: "203.0.113.9"
    })).resolves.toBe("127.0.0.2");
  });

  it("normalizes IPv4-mapped and expanded IPv6 addresses before limiter/audit use", async () => {
    await expect(observedAuthSource({
      remoteAddress: "127.0.0.1",
      xForwardedFor: "::ffff:203.0.113.9"
    })).resolves.toBe("203.0.113.9");
    await expect(observedAuthSource({
      remoteAddress: "::1",
      xForwardedFor: "2001:0db8:0000:0000:0000:0000:0000:0009"
    })).resolves.toBe("2001:db8::9");
  });
});

async function forwardedHeaders(
  route: ProxyRoute,
  trustedClientIp: string,
  extraHeaders: Readonly<Record<string, string>> = {}
): Promise<Headers> {
  let captured: Headers | undefined;
  globalThis.fetch = (async (_url: unknown, init: RequestInit = {}) => {
    captured = new Headers(init.headers);
    return new Response("{}", { status: 202, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  await route.POST(new Request("http://ui.local/api/v1/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [["x","user","dev","token"].join("-")]: "token:test",
      "x-debateai-client-ip": trustedClientIp,
      ...extraHeaders
    },
    body: "{}"
  }), { params: Promise.resolve({ path: ["v1", "auth", "register"] }) });

  expect(captured).toBeDefined();
  return captured!;
}

describe.each([
  ["apps/ui", restoredUiRoute as ProxyRoute]
])("T2 %s proxy header boundary", (_surface, route) => {
  it("uses an explicit allowlist and replaces every caller forwarding header", async () => {
    const headers = await forwardedHeaders(route, "203.0.113.9", {
      authorization: "Bearer must-not-cross",
      cookie: "session=must-not-cross",
      forwarded: "for=198.51.100.250",
      "x-forwarded-for": "198.51.100.250, 192.0.2.77",
      "x-forwarded-host": "attacker.invalid",
      "x-forwarded-proto": "gopher",
      "x-real-ip": "198.51.100.250",
      "cf-connecting-ip": "198.51.100.250"
    });

    expect(Object.fromEntries(headers)).toEqual({
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.9"
    });
  });

  it("normalizes IP literals and refuses malformed, duplicate, or chained values", async () => {
    expect((await forwardedHeaders(route, "::ffff:203.0.113.9")).get("x-forwarded-for"))
      .toBe("203.0.113.9");
    expect((await forwardedHeaders(
      route,
      "2001:0db8:0000:0000:0000:0000:0000:0009"
    )).get("x-forwarded-for")).toBe("2001:db8::9");
    for (const invalid of [
      "203.0.113.9, 198.51.100.7",
      "203.0.113.9,203.0.113.9",
      "203.0.113.999",
      "[2001:db8::9]",
      "fe80::1%lo0",
      ""
    ]) {
      expect((await forwardedHeaders(route, invalid)).get("x-forwarded-for")).toBeNull();
    }
  });
});

describe("T2 Next socket boundary", () => {
  it.each([
    ["apps/ui", hardenRestoredUiHeaders]
  ])("%s overwrites duplicate/spoofed forwarding metadata with the socket peer", (_surface, harden) => {
    const headers: Record<string, string | string[] | undefined> = {
      forwarded: "for=198.51.100.250",
      "x-forwarded-for": ["198.51.100.250", "192.0.2.77"],
      "x-forwarded-host": "attacker.invalid",
      "x-forwarded-proto": "gopher",
      "x-real-ip": "198.51.100.250",
      "cf-connecting-ip": "198.51.100.250",
      "true-client-ip": "198.51.100.250",
      "x-debateai-client-ip": "198.51.100.250"
    };

    harden(headers, "::ffff:203.0.113.9");

    expect(headers).toEqual({ "x-debateai-client-ip": "203.0.113.9" });
  });

  it.each([
    ["apps/ui", hardenRestoredUiHeaders]
  ])("%s fails closed when the socket peer is not an IP literal", (_surface, harden) => {
    const headers: Record<string, string | string[] | undefined> = {
      "x-forwarded-for": "198.51.100.250",
      "x-debateai-client-ip": "198.51.100.250"
    };
    harden(headers, "not-an-ip");
    expect(headers).toEqual({});
  });

  it("the executable UI server replaces caller forwarding metadata before Next sees it", async () => {
    for (const surface of [
      new URL("../../apps/ui/", import.meta.url)
    ]) {
      const source = await readFile(new URL("server.mjs", surface), "utf8");
      expect(source).toContain("hardenIncomingProxyHeaders");
      expect(source).toContain("request.socket.remoteAddress");
      const manifest = JSON.parse(await readFile(new URL("package.json", surface), "utf8")) as {
        readonly scripts: Readonly<Record<string, string>>;
      };
      expect(manifest.scripts.dev).toBe("node server.mjs --dev");
      expect(manifest.scripts.start).toBe("node server.mjs");
    }
  });
});
