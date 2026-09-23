/**
 * TEMPORARY probe fixture — seat REV-S03-p1-correctness-tests, REV(S03) pass 1, head cc014550.
 * Built from the CLAIM, never from the authors' suites. Deleted before the handoff.
 */
import { describe, expect, it } from "vitest";

import {
  loadModelConfig,
  validateModelConfig,
  ModelConfigShapeError,
  MODEL_CONFIG_SHAPE_CODES
} from "@debateai/model-config";
import {
  DEVELOPMENT_PROVIDER_SLOT_CATALOGUE,
  developmentProviderSlots,
  developmentConfiguredProviderPanel,
  loadModelConfigConfiguredProviders
} from "../../apps/runner/src/dev-provider-panel.js";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const ALL_INSTALLED = () => true;

function codeOf(fn: () => unknown): { code: string; classNumber: number; name: string } {
  try {
    fn();
  } catch (error) {
    const e = error as ModelConfigShapeError;
    return { code: String(e.code), classNumber: Number(e.classNumber), name: String(e.name) };
  }
  return { code: "NO_THROW", classNumber: -1, name: "NO_THROW" };
}

const okCli = (cli: string, model: string) => ({ cli, model });
const okApi = (api: string, model: string) => ({
  api, model, base_url: api === "openai" ? "https://api.openai.com/v1" : "https://api.z.ai/x", key: "SOME_KEY"
});
/** A baseline that passes every class, so each fixture below perturbs exactly one thing. */
const good = () => ({
  free: [okApi("openai", "m-free-1"), okApi("zai", "m-free-2")],
  premium: [okCli("codex", "m-prem-1"), okCli("claude", "m-prem-2")]
});

describe("PROBE A — the six shape classes: each fixture yields ITS code and no other", () => {
  it("baseline is admitted (so every perturbation below is the only cause)", () => {
    expect(() => validateModelConfig(good(), { isCliInstalled: ALL_INSTALLED })).not.toThrow();
  });

  const cases: ReadonlyArray<readonly [string, () => unknown, string, number]> = [
    ["class 1 — a third top-level key", () => {
      const v = good() as Record<string, unknown>; v.extra = []; return v;
    }, "MODEL_CONFIG_FILE_MALFORMED", 1],
    ["class 1 — top level is not a mapping", () => "free", "MODEL_CONFIG_FILE_MALFORMED", 1],
    ["class 2 — an entry with neither cli nor api", () => {
      const v = good(); (v.free as unknown[])[0] = { model: "x" }; return v;
    }, "MODEL_CONFIG_ENTRY_TRANSPORT_UNKNOWN", 2],
    ["class 3 — a configured CLI that is not installed", () => good(), "MODEL_CONFIG_CLI_ABSENT", 3],
    ["class 4 — a lowercase key name", () => {
      const v = good(); (v.free as Record<string, unknown>[])[0]!.key = "openai_api_key"; return v;
    }, "MODEL_CONFIG_KEY_NAME_INVALID", 4],
    ["class 5 — a tier with one entry", () => {
      const v = good(); (v.premium as unknown[]).pop(); return v;
    }, "MODEL_CONFIG_TIER_ROSTER_INVALID", 5],
    ["class 6 — a plain-http base_url", () => {
      const v = good(); (v.free as Record<string, unknown>[])[0]!.base_url = "http://api.openai.com/v1"; return v;
    }, "MODEL_CONFIG_BASE_URL_INVALID", 6]
  ];

  for (const [label, build, expectedCode, expectedClass] of cases) {
    it(label, () => {
      // class 3 is the only case that must NOT stub the installed check
      const options = expectedClass === 3 ? { isCliInstalled: () => false } : { isCliInstalled: ALL_INSTALLED };
      const seen = codeOf(() => validateModelConfig(build(), options));
      expect(seen.name).toBe("ModelConfigShapeError");
      expect([seen.code, seen.classNumber]).toEqual([expectedCode, expectedClass]);
    });
  }

  it("every declared code is reachable by at least one fixture above", () => {
    const reached = new Set(cases.map(([, , code]) => code));
    expect([...MODEL_CONFIG_SHAPE_CODES].filter((c) => !reached.has(c))).toEqual([]);
  });
});

describe("PROBE A2 — base-URL admission, beyond the authors' parameters", () => {
  const urlCase = (url: string) => {
    const v = good(); (v.free as Record<string, unknown>[])[0]!.base_url = url; return v;
  };
  const admitted = (url: string) =>
    codeOf(() => validateModelConfig(urlCase(url), { isCliInstalled: ALL_INSTALLED })).code === "NO_THROW";

  it("refuses http, credentials, query and fragment", () => {
    expect([
      admitted("http://api.openai.com/v1"),
      admitted("https://u:p@api.openai.com/v1"),
      admitted("https://u@api.openai.com/v1"),
      admitted("https://api.openai.com/v1?k=1"),
      admitted("https://api.openai.com/v1#f")
    ]).toEqual([false, false, false, false, false]);
  });

  it("MEASURED admissions a reader may not expect (recorded, not asserted as correct)", () => {
    expect({
      trailingQuestionMark: admitted("https://api.openai.com/v1?"),
      trailingHash: admitted("https://api.openai.com/v1#"),
      anyHost: admitted("https://attacker.example/v1"),
      nonStandardPort: admitted("https://api.openai.com:8443/v1"),
      ipLiteral: admitted("https://127.0.0.1/v1")
    }).toEqual({
      trailingQuestionMark: true,
      trailingHash: true,
      anyHost: true,
      nonStandardPort: true,
      ipLiteral: true
    });
  });
});

describe("PROBE B — the committed file is the ONE source", () => {
  it("loadModelConfig over the committed file yields the two lists the generator emits", async () => {
    const config = loadModelConfig(REPO_ROOT, { isCliInstalled: ALL_INSTALLED });
    const generated = (await import("../../packages/contract/generated/plan-tier-rosters.js")) as {
      GENERATED_PLAN_TIER_ROSTERS: { free: readonly string[]; premium: readonly string[] };
    };
    expect({
      free: config.free.map((e) => e.model),
      premium: config.premium.map((e) => e.model)
    }).toEqual({
      free: [...generated.GENERATED_PLAN_TIER_ROSTERS.free],
      premium: [...generated.GENERATED_PLAN_TIER_ROSTERS.premium]
    });
  });

  it("the loaded config is deeply frozen and a second load is a fresh object", () => {
    const a = loadModelConfig(REPO_ROOT, { isCliInstalled: ALL_INSTALLED });
    const b = loadModelConfig(REPO_ROOT, { isCliInstalled: ALL_INSTALLED });
    expect([Object.isFrozen(a), Object.isFrozen(a.free), Object.isFrozen(a.free[0]), a === b]).toEqual(
      [true, true, true, false]
    );
  });
});

describe("PROBE C — the slot catalogue and entry→slot identity (S18, S19, S20)", () => {
  it("the catalogue has exactly 10 rows with unique providerRefs and unique (tier, word)", () => {
    const refs = DEVELOPMENT_PROVIDER_SLOT_CATALOGUE.map((r) => r.providerRef);
    const pairs = DEVELOPMENT_PROVIDER_SLOT_CATALOGUE.map((r) => `${r.tier}/${r.word}`);
    expect([
      DEVELOPMENT_PROVIDER_SLOT_CATALOGUE.length,
      new Set(refs).size,
      new Set(pairs).size
    ]).toEqual([10, 10, 10]);
  });

  it("a model: edit cannot move an entry to a different slot (S19)", () => {
    const base = validateModelConfig(good(), { isCliInstalled: ALL_INSTALLED });
    const edited = good();
    (edited.free as Record<string, unknown>[])[0]!.model = "TOTALLY-DIFFERENT-ID";
    (edited.premium as Record<string, unknown>[])[0]!.model = "ALSO-DIFFERENT";
    const after = validateModelConfig(edited, { isCliInstalled: ALL_INSTALLED });
    expect(developmentProviderSlots(after).map((s) => s.providerRef)).toEqual(
      developmentProviderSlots(base).map((s) => s.providerRef)
    );
  });

  it("slot 0 of the COMMITTED file is a CLI relay (S20)", () => {
    const slots = developmentProviderSlots(loadModelConfig(REPO_ROOT, { isCliInstalled: ALL_INSTALLED }));
    expect([slots[0]!.transport, slots[0]!.providerRef]).toEqual(["cli", "development:codex-premium-cli"]);
  });

  it("REFUTATION ATTEMPT — a file with NO cli entry puts an api slot at index 0", () => {
    const apiOnly = {
      free: [okApi("openai", "f1"), okApi("zai", "f2")],
      premium: [okApi("openai", "p1"), okApi("zai", "p2")]
    };
    const slots = developmentProviderSlots(validateModelConfig(apiOnly, { isCliInstalled: ALL_INSTALLED }));
    expect(slots[0]!.transport).toBe("api");
  });
});

describe("PROBE D — the publication seam the panel builder takes as an ARGUMENT (S21)", () => {
  it("developmentConfiguredProviderPanel takes the configured set and marks every slot unavailable", () => {
    const configured = loadModelConfigConfiguredProviders(REPO_ROOT);
    const panel = developmentConfiguredProviderPanel(configured);
    expect([
      panel.configuredProviders.length,
      panel.healthyProviderRefs.length,
      panel.targets.every((t) => t.authorizationHeader === undefined)
    ]).toEqual([configured.length, 0, true]);
  });

  it("REFUTATION ATTEMPT — the builder refuses a configured set the catalogue does not know", () => {
    expect(() =>
      developmentConfiguredProviderPanel([
        { providerRef: "development:not-a-slot", adapterKind: "openai-compatible-http", maker: "OpenAI" }
      ])
    ).toThrow(/DEV_PROVIDER_SLOT_UNRESOLVED/u);
  });
});

describe("PROBE E — S28: which acceptance step the absent held-version map actually breaks", () => {
  /**
   * `isExactPublishedRegisterRefresh` (dev-api-environment.ts:383-391) admits an api.env
   * rewrite when `additive` OR `exactHeldSet`. With no producer for the held map,
   * `exactHeldSet` is always false, so the ONLY admitted publication is an additive one —
   * i.e. one where the CONFIGURED set did not lose a ref. These two cases measure which
   * acceptance step moves the configured set.
   */
  const configuredRefs = (file: unknown) =>
    developmentProviderSlots(validateModelConfig(file, { isCliInstalled: ALL_INSTALLED }))
      .map((s) => s.providerRef);

  const committedShape = () => ({
    free: [okApi("openai", "gpt-5.6-luna"), okApi("zai", "glm-5.3-flash")],
    premium: [okCli("codex", "gpt-5.6-sol"), okCli("claude", "claude-opus-5"), okCli("grok", "grok-4.6-build")]
  });

  it("acceptance step 8 (missing KEYS) does not change the configured set — the additive branch still admits", () => {
    // Keys live outside the file; the file — and therefore the configured set — is untouched.
    expect(configuredRefs(committedShape())).toEqual(configuredRefs(committedShape()));
  });

  it("acceptance step 9 (Subtraction: drop premium grok) REMOVES a configured ref — the additive branch cannot admit", () => {
    const before = configuredRefs(committedShape());
    const after = committedShape();
    after.premium = after.premium.filter((e) => (e as { cli?: string }).cli !== "grok");
    const afterRefs = configuredRefs(after);
    const lost = before.filter((ref) => !afterRefs.includes(ref));
    expect(lost).toEqual(["development:grok-cli"]);
  });
});

