import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PROVIDER_COMPANY_HOSTS } from "@debateai/providers";
import en from "../../apps/ui/messages/en/legal.json";
import ro from "../../apps/ui/messages/ro/legal.json";
import { LegalProvidersBody } from "../../apps/ui/components/legal/LegalBodies.js";
import {
  ANTHROPIC_PREVIEW_PROVIDER,
  DEEPINFRA_PROVIDER,
  MODEL_PROVIDERS,
  SUPPORT_PROVIDER,
  providerRegister,
  type ProviderRegisterEntry
} from "../../apps/ui/lib/legal/pages.js";

/**
 * Side-by-side spec §13, addition D24 (owner's answer to Q-L6, 2026-10-22: "I would list only the providers, not
 * necessarely the models used [...] these need to be done automatically, so if we add a new provider, the page would
 * also list that"). The Model providers page is built from the companies the API's declared targets reach
 * (`GET /v1/public/ai-providers`, read by `readAiProviderCompanies`), not from a build flag: each reviewed company it
 * names gets its checked row (Anthropic, then DeepInfra), an unknown host an unchecked row headed by its host name
 * (ruling R20), the support chat's model always last; no answer lists the whole reviewed catalogue. No row names a
 * model, in any of the 35 languages, and the hosted cloud rows (OpenAI, xAI, Google, the own-servers Qwen) never show.
 */
const MODEL_NAMES = ["GLM-5.3-Flash", "DeepSeek-V4.1-Flash", "MiMo-V2.6-Pro", "Qwen3.8-Flash", "Claude Haiku 5.5", "Gemini"] as const;
/** The labels every row shows, in order: the Privacy Policy §5 facts without the old models line. */
const FACT_LABEL_KEYS = [
  "legal.providers.colEntity",
  "legal.providers.colCountry",
  "legal.providers.colPurpose",
  "legal.providers.colLocation",
  "legal.providers.colRetention",
  "legal.providers.colZeroRetention",
  "legal.providers.colTraining",
  "legal.providers.colBasis",
  "legal.providers.colContact",
  "legal.providers.colChecked"
] as const;
const NEW_KEYS = [
  "legal.providers.ireland",
  "legal.providers.locationAnthropic",
  "legal.providers.locationGoogle",
  "legal.providers.retentionAnthropic",
  "legal.providers.retentionGoogle",
  "legal.providers.sccBasis"
] as const;
const ACME = "host:api.acme.example";

/** Text as React's static renderer escapes it. */
const escaped = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const keysOf = (entries: readonly ProviderRegisterEntry[]) => entries.map((entry) => entry.key);
const messages = resolve(process.cwd(), "apps/ui/messages");
const locales = readdirSync(messages);
const catalogOf = (locale: string) =>
  JSON.parse(readFileSync(resolve(messages, locale, "legal.json"), "utf8")) as Record<string, string>;

/** Every company list the page can be built from, and the rows each gives. */
const CASES: ReadonlyArray<readonly [label: string, companies: readonly string[] | null, keys: readonly string[]]> = [
  ["anthropic + deepinfra", ["anthropic", "deepinfra"], ["claude", "deepinfra", "support"]],
  ["the answer's order does not matter", ["deepinfra", "anthropic"], ["claude", "deepinfra", "support"]],
  ["deepinfra alone (the GLM-only set)", ["deepinfra"], ["deepinfra", "support"]],
  ["anthropic alone", ["anthropic"], ["claude", "support"]],
  ["no answer", null, ["claude", "deepinfra", "support"]],
  ["an empty answer", [], ["claude", "deepinfra", "support"]],
  ["deepinfra + an unknown host", ["deepinfra", ACME], ["deepinfra", ACME, "support"]]
];

describe("the rows are the companies the API answers (addition D24)", () => {
  for (const [label, companies, keys] of CASES) {
    it(`${label} → ${keys.join(", ")}`, () => {
      const entries = providerRegister(companies);
      expect(keysOf(entries)).toEqual(keys);
      expect(Object.isFrozen(entries)).toBe(true);
      expect(entries.at(-1)).toBe(SUPPORT_PROVIDER);
      if (keys.includes("claude")) expect(entries.find((entry) => entry.key === "claude")).toBe(ANTHROPIC_PREVIEW_PROVIDER);
      if (keys.includes("deepinfra")) expect(entries.find((entry) => entry.key === "deepinfra")).toBe(DEEPINFRA_PROVIDER);
    });
  }

  it("unknown hosts come after the reviewed rows, sorted, once each", () => {
    expect(keysOf(providerRegister(["host:b.example", "deepinfra", "host:a.example", "host:b.example", "anthropic"])))
      .toEqual(["claude", "deepinfra", "host:a.example", "host:b.example", "support"]);
  });

  it("every company the API's host table can name is a reviewed row, never an unchecked one", () => {
    for (const company of new Set(Object.values(PROVIDER_COMPANY_HOSTS))) {
      const [row] = providerRegister([company]);
      expect(row?.key, company).not.toMatch(/^host:/u);
      expect(row?.checkedOn, company).not.toBeNull();
      expect(row?.purposesConfirmed, company).toBe(true);
    }
  });

  it("an unknown host is an unchecked row headed by its host name: every fact to confirm, never checked (ruling R20)", () => {
    const row = providerRegister(["deepinfra", ACME]).find((entry) => entry.key === ACME);
    expect(row).toMatchObject({
      provider: "api.acme.example",
      nameKey: null,
      entity: "[…]",
      homeCountryKey: "legal.providers.unconfirmed",
      purposesConfirmed: false,
      locationKey: "legal.providers.unconfirmed",
      retentionKey: "legal.providers.unconfirmed",
      zeroRetention: "unconfirmed",
      training: "unconfirmed",
      contact: "[…]",
      checkedOn: null
    });
    for (const catalog of [en, ro]) {
      const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={catalog} entries={providerRegister(["deepinfra", ACME])} />);
      const section = html.slice(html.indexOf(`id="legal-provider-${ACME}"`), html.indexOf('id="legal-provider-support"'));
      expect(section).toContain(">api.acme.example</h2>");
      expect(section).toContain(escaped(catalog["legal.providers.notChecked"]));
      expect(section).toContain(escaped(catalog["legal.providers.purposesUnconfirmed"]));
      // Every fact cell is bracketed: "[…]", "[to confirm]", the bracketed basis, "[not checked yet]".
      const cells = [...section.matchAll(/<td>([\s\S]*?)<\/td>/gu)].map((match) => match[1]!);
      expect(cells).toHaveLength(FACT_LABEL_KEYS.length);
      for (const [index, cell] of cells.entries()) {
        if (FACT_LABEL_KEYS[index] === "legal.providers.colPurpose") continue;
        expect(cell, FACT_LABEL_KEYS[index]).toContain("[");
      }
    }
  });

  it("LegalProvidersBody renders exactly the entries it is given, in order", () => {
    for (const entries of [[SUPPORT_PROVIDER], [DEEPINFRA_PROVIDER, SUPPORT_PROVIDER], [SUPPORT_PROVIDER, ANTHROPIC_PREVIEW_PROVIDER], []]) {
      const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={en} entries={entries} />);
      expect([...html.matchAll(/id="legal-provider-([^"]+)"/gu)].map((match) => match[1])).toEqual(keysOf(entries));
      expect(html).toContain(escaped(en["legal.providers.intro"]));
    }
  });
});

describe("no row names a model, in any of the 35 languages (owner 2026-10-22: providers, not models)", () => {
  it("has 35 locales", () => expect(locales).toHaveLength(35));
  for (const locale of locales) {
    it(`${locale}: every case shows only the company facts, no model and no models line`, () => {
      const catalog = catalogOf(locale);
      for (const [label, companies, keys] of CASES) {
        const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={catalog} entries={providerRegister(companies)} />);
        for (const name of MODEL_NAMES) expect(html, `${locale} ${label} ${name}`).not.toContain(name);
        // Each row's labels are exactly the ten fact labels: the models line is gone.
        const labels = [...html.matchAll(/<th scope="row">([\s\S]*?)<\/th>/gu)].map((match) => match[1]);
        expect(labels, `${locale} ${label}`).toEqual(keys.flatMap(() => FACT_LABEL_KEYS.map((key) => escaped(catalog[key] ?? "missing"))));
        expect(html.match(/class="legalProviderEntry"/gu)?.length ?? 0, `${locale} ${label}`).toBe(keys.length);
      }
    });
  }
  it("English has no Models label at all", () => {
    for (const [, companies] of CASES) {
      expect(renderToStaticMarkup(<LegalProvidersBody legalCatalog={en} entries={providerRegister(companies)} />)).not.toMatch(/>Models</u);
    }
  });
});

describe("the hosted site's cloud rows never show (owner, 10 October 2026; addition D24)", () => {
  for (const [label, companies] of CASES) {
    it(`no OpenAI, xAI, hosted Google or own-servers Qwen row: ${label}`, () => {
      const entries = providerRegister(companies);
      for (const key of ["gpt", "gemini", "grok", "qwen"]) expect(keysOf(entries), key).not.toContain(key);
      for (const hosted of MODEL_PROVIDERS) expect(entries).not.toContain(hosted);
      for (const catalog of [en, ro]) {
        const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={catalog} entries={entries} />);
        for (const key of ["gpt", "gemini", "grok", "qwen"]) expect(html, key).not.toContain(`id="legal-provider-${key}"`);
        for (const company of ["OpenAI", "OpenAI Ireland Limited", "X.AI LLC", "xAI", "Google"]) expect(html, company).not.toContain(company);
        expect(html).not.toContain(escaped(catalog["legal.providers.ownServers"]));
        expect(html).not.toContain(escaped(catalog["legal.providers.ownLocation"]));
        expect(html).not.toContain(escaped(catalog["legal.providers.retentionGoogle"]));
        expect(html).not.toContain("legal-notices@google.com");
      }
    });
  }

  it("the reviewed Anthropic row keeps its checked facts in every language", () => {
    for (const locale of ["en", "ro", "ja", "ko", "zh", "ga"]) {
      const catalog = catalogOf(locale);
      const html = renderToStaticMarkup(<LegalProvidersBody legalCatalog={catalog} entries={providerRegister(["anthropic", "deepinfra"])} />);
      expect(html.match(/id="legal-provider-deepinfra"/g), locale).toHaveLength(1);
      expect(html.match(/id="legal-provider-claude"/g), locale).toHaveLength(1);
      expect(html, locale).toContain("Anthropic Ireland, Limited");
      expect(html, locale).toContain('href="mailto:privacy@anthropic.com"');
      expect(html, locale).toContain(escaped(catalog["legal.providers.retentionAnthropic"] ?? "missing"));
      expect(html, locale).toContain(escaped(catalog["legal.providers.sccBasis"] ?? "missing"));
    }
  });
});

/**
 * Addition D24 item 3: the page's server-side reader. One ask at most a minute, 2 s each; a refusal, a malformed or
 * empty body or a slow API keeps the last good answer, else null (the whole reviewed catalogue). Never throws.
 */
describe("readAiProviderCompanies (addition D24 item 3)", () => {
  const BASE = "http://api.test.invalid";
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** A fresh reader (its memory is per module) over a stubbed fetch. */
  async function reader(fetchImplementation: typeof fetch) {
    vi.stubEnv("DIALECTICAL_API_BASE", BASE);
    vi.stubGlobal("fetch", vi.fn(fetchImplementation));
    vi.resetModules();
    const { readAiProviderCompanies } = await import("../../apps/ui/lib/legal/providerCompanies.js");
    return { read: readAiProviderCompanies, fetch: globalThis.fetch as unknown as ReturnType<typeof vi.fn> };
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("returns a good answer, asks the public route, and keeps it for the next 60 s", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-22T10:00:00.000Z") });
    const { read, fetch } = await reader(async () => json({ companies: ["anthropic", "deepinfra"] }));
    expect(await read()).toEqual(["anthropic", "deepinfra"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toBe(`${BASE}/v1/public/ai-providers`);
    fetch.mockImplementation(async () => { throw new Error("down"); });
    vi.advanceTimersByTime(59_000);
    // Within 60 s a failing API is not even asked: the cached answer stands.
    expect(await read()).toEqual(["anthropic", "deepinfra"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    // After 60 s it asks again; the failure keeps the last good answer.
    vi.advanceTimersByTime(2_000);
    expect(await read()).toEqual(["anthropic", "deepinfra"]);
    expect(fetch).toHaveBeenCalledTimes(2);
    // A later good answer replaces it.
    fetch.mockImplementation(async () => json({ companies: ["deepinfra", ACME] }));
    vi.advanceTimersByTime(61_000);
    expect(await read()).toEqual(["deepinfra", ACME]);
  });

  it("a slow API (over 2 s) gives null with nothing cached, and the cached answer once there is one", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-22T10:00:00.000Z") });
    const never = (_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
    const { read, fetch } = await reader(never as typeof globalThis.fetch);
    const first = read();
    await vi.advanceTimersByTimeAsync(2_001);
    expect(await first).toBeNull();
    // The abort reached the request.
    expect((fetch.mock.calls[0]?.[1] as RequestInit | undefined)?.signal?.aborted).toBe(true);
    fetch.mockImplementation(async () => json({ companies: ["deepinfra"] }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await read()).toEqual(["deepinfra"]);
    fetch.mockImplementation(never as typeof globalThis.fetch);
    await vi.advanceTimersByTimeAsync(60_000);
    const slow = read();
    await vi.advanceTimersByTimeAsync(2_001);
    expect(await slow).toEqual(["deepinfra"]);
  });

  for (const [label, answer] of [
    ["a 404", () => json({ error: "NOT_FOUND", message: "NOT_FOUND" }, 404)],
    ["a 429", () => json({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" }, 429)],
    ["a malformed body", () => new Response("not json", { status: 200 })],
    ["an extra member", () => json({ companies: ["deepinfra"], models: ["zai-org/GLM-5.3-Flash"] })],
    ["an empty list", () => json({ companies: [] })],
    ["a network failure", () => { throw new TypeError("fetch failed"); }]
  ] as const) {
    it(`${label} gives null with nothing cached and the cached answer once there is one; it never throws`, async () => {
      vi.useFakeTimers({ now: new Date("2026-10-22T10:00:00.000Z") });
      const { read, fetch } = await reader(async () => answer());
      await expect(read()).resolves.toBeNull();
      fetch.mockImplementation(async () => json({ companies: ["anthropic"] }));
      vi.advanceTimersByTime(60_000);
      expect(await read()).toEqual(["anthropic"]);
      fetch.mockImplementation(async () => answer());
      vi.advanceTimersByTime(60_000);
      await expect(read()).resolves.toEqual(["anthropic"]);
    });
  }

  it("with no API base configured it gives null rather than throwing", async () => {
    vi.stubEnv("DIALECTICAL_API_BASE", "");
    vi.resetModules();
    const { readAiProviderCompanies } = await import("../../apps/ui/lib/legal/providerCompanies.js");
    await expect(readAiProviderCompanies()).resolves.toBeNull();
  });
});

describe("the Register words still exist in all 35 languages", () => {
  for (const locale of locales) {
    it(`${locale} has every checked-row key, filled and unbracketed`, () => {
      const catalog = catalogOf(locale);
      for (const key of NEW_KEYS) {
        expect(typeof catalog[key], `${locale} ${key}`).toBe("string");
        expect(catalog[key]?.trim(), `${locale} ${key}`).not.toBe("");
        expect(catalog[key], `${locale} ${key}`).not.toContain("[");
      }
      // The numbers are facts: 30 days, 7 years for safety-check results, 55 days at Google.
      expect(catalog["legal.providers.retentionAnthropic"], locale).toMatch(/30[^0-9][\s\S]*7[^0-9]|30[^0-9][\s\S]*7$/);
      expect(catalog["legal.providers.retentionGoogle"], locale).toContain("55");
      if (locale !== "en") {
        // Facts other than the brand names are translated, not copied from English.
        expect(catalog["legal.providers.retentionGoogle"], locale).not.toBe(en["legal.providers.retentionGoogle"]);
      }
      // Addition D24: the models label is gone from every catalogue (nothing reads it any more).
      expect(Object.keys(catalog).filter((key) => key === "legal.providers.colModels"), locale).toEqual([]);
    });
  }
});
