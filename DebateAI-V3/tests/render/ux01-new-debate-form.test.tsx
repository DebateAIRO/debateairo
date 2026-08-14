import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deployment, Session } from "@debateai/contract";
import {
  PROVISIONAL_COMPOSITION_BUDGET_DEFAULT,
  buildNewDebateAskConfig,
  deriveAgentCountDefault,
  deriveRiskTierDefault,
  deriveSessionAskDefaults
} from "../../apps/v2-ui/app/new/defaults.js";

process.env.TZ = "UTC";

const pageMocks = vi.hoisted(() => ({
  authToken: "token:test-user-alpha",
  createDebate: vi.fn(),
  readDeployment: vi.fn(),
  readSession: vi.fn(),
  push: vi.fn()
}));

const hooks = vi.hoisted(() => {
  let cursor = 0;
  let slots: unknown[] = [];
  let pendingEffects: Array<() => void | (() => void)> = [];
  const sameDependencies = (left: readonly unknown[] | undefined, right: readonly unknown[] | undefined) =>
    left !== undefined && right !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  return {
    beginRender() { cursor = 0; },
    reset() { cursor = 0; slots = []; pendingEffects = []; },
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      const set = (next: T | ((current: T) => T)) => {
        const current = slots[index] as T;
        slots[index] = typeof next === "function" ? (next as (value: T) => T)(current) : next;
      };
      return [slots[index] as T, set] as const;
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: T };
    },
    useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]) {
      const index = cursor++;
      const previous = slots[index] as readonly unknown[] | undefined;
      if (!sameDependencies(previous, dependencies)) pendingEffects.push(effect);
      slots[index] = dependencies;
    },
    async flushEffects() {
      const effects = pendingEffects;
      pendingEffects = [];
      for (const effect of effects) effect();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
  };
});

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: hooks.useEffect,
  useRef: hooks.useRef,
  useState: hooks.useState
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pageMocks.push }),
  useSearchParams: () => new URLSearchParams("topic=Should cities replace private cars with shared transit?")
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => React.ReactNode }) => children(pageMocks.authToken)
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/v2-ui/lib/api.js")>()),
  contractClient: {
    readDeployment: pageMocks.readDeployment,
    readSession: pageMocks.readSession
  },
  createDebate: pageMocks.createDebate
}));

const deployment: Deployment = {
  register: {
    register_version: 8,
    rows: [
      { row_key: "riskTier", value: "standard", source_ref: "register:test:risk" },
      {
        row_key: "runCostEnvelope",
        value: {
          kind: "RUN_COST_ENVELOPE_POLICY",
          members: [{ depth_params: { depth: 2 }, risk_tier: "standard", max_model_attempts: 108 }]
        },
        source_ref: "register:test:envelope"
      },
      {
        row_key: "configuredProviderSet",
        value: {
          kind: "CONFIGURED_PROVIDER_SET",
          requiredDistinctMakers: 1,
          providers: [
            { providerRef: "provider:openai", adapterKind: "CLI", maker: "OpenAI" },
            { providerRef: "provider:anthropic", adapterKind: "CLI", maker: "Anthropic" }
          ]
        },
        source_ref: "acceptance:DR-140:V-approved"
      }
    ]
  },
  scorecards: [],
  // B3: routing outcomes across task classes are deliberately noisy and must
  // have no bearing on configured debate-maker cardinality.
  model_ledger: [
    { task_class: "JUDGE", model_id: "judge", model_version: "1", provider: "judge-provider", routing_decision_ref: "route:judge" },
    { task_class: "COMPOSER", model_id: "composer", model_version: "1", provider: "composer-provider", routing_decision_ref: "route:composer" },
    { task_class: "CRITIC", model_id: "critic", model_version: "1", provider: "critic-provider", routing_decision_ref: "route:critic" }
  ],
  fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
};

const session: Session = {
  asker_id: "asker:test-user-alpha",
  session_id: "session:test-user-alpha",
  caller_scope: "ASKER",
  ownership_provenance: "user_dev_token",
  provisional_identity_model: true
};

function evaluateElementTree(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(evaluateElementTree);
  if (!isValidElement(node)) return node;
  if (typeof node.type === "function") {
    const Component = node.type as (props: Record<string, unknown>) => ReactNode;
    return evaluateElementTree(Component(node.props as Record<string, unknown>));
  }
  const children = evaluateElementTree((node.props as { children?: ReactNode }).children);
  if (typeof node.type !== "string") return children;
  return cloneElement(node, undefined, children);
}

function findElement(node: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match !== null) return match;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (predicate(node)) return node;
  return findElement((node.props as { children?: ReactNode }).children, predicate);
}

function textContent(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement(node)) return "";
  return textContent((node.props as { children?: ReactNode }).children);
}

async function renderRealNewDebatePageState(): Promise<{
  html: string;
  tree: ReactNode;
}> {
  const { default: NewDebatePage } = await import("../../apps/v2-ui/app/new/page.js");
  let html = "";
  let tree: ReactNode = null;
  for (let pass = 0; pass < 4; pass += 1) {
    hooks.beginRender();
    html = renderToStaticMarkup(<NewDebatePage />);
    await hooks.flushEffects();
  }
  hooks.beginRender();
  tree = evaluateElementTree(<NewDebatePage />);
  return { html, tree };
}

async function renderRealNewDebatePage(): Promise<string> {
  return (await renderRealNewDebatePageState()).html;
}

describe("UX-01 machine-defaulted real /new flow", () => {
  beforeEach(() => {
    hooks.reset();
    pageMocks.authToken = "token:test-user-alpha";
    pageMocks.createDebate.mockReset().mockResolvedValue({ id: "run:new" });
    pageMocks.readDeployment.mockReset().mockResolvedValue(deployment);
    pageMocks.readSession.mockReset().mockResolvedValue(session);
    pageMocks.push.mockReset();
  });

  it("ASK-01 RED + mutations: caps configured makers at the ratified guard source without hardcoding two", () => {
    expect(deriveAgentCountDefault(deployment)).toEqual({
      agentCount: "2",
      agentCountProvenance: "configuredProviderSet@8:acceptance:DR-140:V-approved (Anthropic, OpenAI); capped by runCostEnvelope@8:register:test:envelope (M=2)"
    });
    const providerSetRow = deployment.register.rows.find((row) => row.row_key === "configuredProviderSet")!;
    const providerSet = providerSetRow.value as { providers: unknown[] };
    const expandedDeployment = {
      ...deployment,
      register: {
        ...deployment.register,
        rows: deployment.register.rows.map((row) => row.row_key === "configuredProviderSet" ? {
          ...row,
          value: {
            ...(row.value as object),
            providers: [...providerSet.providers, { providerRef: "provider:cohere", adapterKind: "CLI", maker: "Cohere" }]
          }
        } : row)
      }
    };
    expect(deriveAgentCountDefault(expandedDeployment as Deployment).agentCount).toBe("2");
    const ratifiedThreeDeployment = {
      ...expandedDeployment,
      register: {
        ...expandedDeployment.register,
        rows: expandedDeployment.register.rows.map((row) => row.row_key === "runCostEnvelope" ? {
          ...row,
          value: {
            kind: "RUN_COST_ENVELOPE_POLICY",
            members: [{ depth_params: { depth: 2 }, risk_tier: "standard", max_model_attempts: 174 }]
          },
          source_ref: "fixture:ratified-M3"
        } : row)
      }
    };
    expect(deriveAgentCountDefault(ratifiedThreeDeployment as Deployment).agentCount).toBe("3");
  });

  it("M7: refuses a run-cost envelope ceiling that is not an exact Set-A maker maximum", () => {
    const inexactEnvelopeDeployment = {
      ...deployment,
      register: {
        ...deployment.register,
        rows: deployment.register.rows.map((row) => row.row_key === "runCostEnvelope" ? {
          ...row,
          value: {
            kind: "RUN_COST_ENVELOPE_POLICY",
            members: [{ depth_params: { depth: 2 }, risk_tier: "standard", max_model_attempts: 109 }]
          }
        } : row)
      }
    };

    expect(() => deriveAgentCountDefault(inexactEnvelopeDeployment as Deployment)).toThrow(expect.objectContaining({
      code: "ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE",
      message: "The deployment runCostEnvelope does not encode a ratified maker maximum."
    }));
  });

  it("B2: an absent provider set does not suppress the independent deployment risk floor", () => {
    const withoutProviders = {
      ...deployment,
      register: { ...deployment.register, rows: deployment.register.rows.filter((row) => row.row_key !== "configuredProviderSet") }
    };
    expect(() => deriveAgentCountDefault(withoutProviders)).toThrow(expect.objectContaining({ code: "ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE" }));
    expect(deriveRiskTierDefault(withoutProviders)).toEqual({
      riskTier: "standard",
      riskTierProvenance: "deployment riskTier floor (register:test:risk)"
    });
  });

  it("B2/B5: an absent risk floor leaves provider and envelope derivations intact without fabricating risk", async () => {
    pageMocks.readDeployment.mockResolvedValue({
      ...deployment,
      register: { ...deployment.register, rows: deployment.register.rows.filter((row) => row.row_key !== "riskTier") }
    });
    const html = await renderRealNewDebatePage();
    expect(html).toContain("ASK_RISK_TIER_DEFAULT_UNAVAILABLE");
    expect(html).not.toContain('id="agentCount"');
    expect(html).toMatch(/<select[^>]*id="riskTier"[^>]*><option value="" selected="">/);
    expect(html).toContain("Choose a risk tier with a ruled run-cost envelope before starting.");
    expect(html).toMatch(/<button type="submit" class="startBtn" disabled=""/);
  });

  it("B2/B5: an absent run envelope leaves provider and risk derivations intact without fabricating depth", async () => {
    pageMocks.readDeployment.mockResolvedValue({
      ...deployment,
      register: { ...deployment.register, rows: deployment.register.rows.filter((row) => row.row_key !== "runCostEnvelope") }
    });
    const html = await renderRealNewDebatePage();
    expect(html).not.toContain('id="agentCount"');
    expect(html).toContain('value="standard" selected=""');
    expect(html).not.toContain("At depth 2, this run may spend up to 66 model attempts");
    expect(html).toMatch(/<button type="submit" class="startBtn" disabled=""/);
  });

  it("MUTATION decision_owner: uses asker identity, not token/session id", () => {
    expect(deriveSessionAskDefaults(session).decisionOwner).toBe("asker:test-user-alpha");
  });

  it("MUTATION action_owner: does not leave the former empty field", () => {
    expect(deriveSessionAskDefaults(session).actionOwner).toBe("asker:test-user-alpha");
  });

  it("MUTATION decision_scope: keeps V's ruled personal value", () => {
    expect(deriveSessionAskDefaults(session).decisionScope).toBe("personal");
  });

  it("MUTATION as_of: refreshes untouched machine time at submit", () => {
    const defaults = deriveSessionAskDefaults(session, new Date("2026-08-13T05:00:00.000Z"));
    const config = buildNewDebateAskConfig({
      ...deriveAgentCountDefault(deployment),
      ...deriveRiskTierDefault(deployment),
      ...defaults,
      budgetTier: PROVISIONAL_COMPOSITION_BUDGET_DEFAULT,
      depth: 2,
      asOfWasEdited: false
    }, new Date("2026-08-13T05:02:03.456Z"));
    expect(config.as_of).toBe("2026-08-13T05:02:03.456Z");
  });

  it("DR-180 + MUTATION disclosure: renders only the DR-166-C ask surface and never renders machine controls", async () => {
    const html = await renderRealNewDebatePage();
    expect(html).not.toContain("Advanced");
    expect(html).not.toContain('id="machineOwnedAskFields"');
    expect(html).toContain('id="budgetTier"');
    expect(html).toContain('id="riskTier"');
    expect(html).toContain('id="treeDepth"');
    expect(html).toContain('value="low" selected=""');
    expect(html).toMatch(/<button type="submit" class="startBtn ready"(?![^>]*disabled)/);
    expect(html).not.toContain("ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE");
    for (const id of ["agentCount", "asOf", "decisionOwner", "actionOwner", "decisionScope"]) {
      expect(html, id).not.toContain(`id="${id}"`);
    }
  });

  it("R3: the surviving Options disclosure exposes aria-controls only while its panel exists", async () => {
    const initial = await renderRealNewDebatePageState();
    expect(initial.html).toMatch(/<button[^>]*class="optionsToggle"[^>]*aria-expanded="false"[^>]*>Options/);
    expect(initial.html).not.toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="additionalRunOptions"/);
    expect(initial.html).not.toContain('id="additionalRunOptions"');

    const optionsButton = findElement(initial.tree, (element) =>
      element.type === "button" && element.props.className === "optionsToggle"
    );
    expect(optionsButton).not.toBeNull();
    (optionsButton!.props as { onClick: () => void }).onClick();

    hooks.beginRender();
    const { default: NewDebatePage } = await import("../../apps/v2-ui/app/new/page.js");
    const openHtml = renderToStaticMarkup(<NewDebatePage />);
    expect(openHtml).toMatch(/<button[^>]*aria-expanded="true"[^>]*aria-controls="additionalRunOptions"[^>]*>Options/);
    expect(openHtml).toContain('id="additionalRunOptions"');
  });

  it("DR-166-B + MUTATION collapsed-submit: creates the fully defaulted ask without opening Advanced", async () => {
    const { html, tree } = await renderRealNewDebatePageState();
    expect(html).toMatch(/<button type="submit" class="startBtn ready"(?![^>]*disabled)/);
    expect(html).not.toContain('id="machineOwnedAskFields"');
    const form = findElement(tree, (element) => element.type === "form");
    expect(form).not.toBeNull();
    const preventDefault = vi.fn();
    await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> }).onSubmit({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(pageMocks.createDebate).toHaveBeenCalledOnce();
    const [topic, config, token] = pageMocks.createDebate.mock.calls[0]!;
    expect(topic).toBe("Should cities replace private cars with shared transit?");
    expect(token).toBe("token:test-user-alpha");
    expect(config).toMatchObject({
      risk_tier: "standard",
      tier_source: "MACHINE_DEFAULT",
      tier_provenance_ref: "machine:deployment-floor",
      composition_budget_tier: "low",
      depth: 2,
      agent_count: 2,
      decision_owner: "asker:test-user-alpha",
      action_owner: "asker:test-user-alpha",
      decision_scope: "personal"
    });
    expect(new Date((config as { as_of: string }).as_of).toISOString()).toBe((config as { as_of: string }).as_of);
    expect(pageMocks.push).toHaveBeenCalledWith("/debate/run%3Anew");
  });

  it("ASK-01 live regression: configured=3 and ratified=2 makes bare Start submit two and receive acceptance", async () => {
    const providerSetRow = deployment.register.rows.find((row) => row.row_key === "configuredProviderSet")!;
    const providerSet = providerSetRow.value as { providers: unknown[] };
    pageMocks.readDeployment.mockResolvedValue({
      ...deployment,
      register: {
        ...deployment.register,
        rows: deployment.register.rows.map((row) => row.row_key === "configuredProviderSet" ? {
          ...row,
          value: {
            ...(row.value as object),
            providers: [...providerSet.providers, { providerRef: "provider:xai", adapterKind: "CLI", maker: "xAI" }]
          }
        } : row)
      }
    });
    pageMocks.createDebate.mockImplementation(async (_topic, config: { agent_count: number }) => {
      if (config.agent_count > 2) throw new Error("RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE");
      return { id: "run:accepted" };
    });

    const { tree } = await renderRealNewDebatePageState();
    const form = findElement(tree, (element) => element.type === "form");
    expect(form).not.toBeNull();
    await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> }).onSubmit({ preventDefault: vi.fn() });

    expect(pageMocks.createDebate).toHaveBeenCalledOnce();
    expect(pageMocks.createDebate.mock.calls[0]![1]).toMatchObject({ agent_count: 2 });
    expect(pageMocks.push).toHaveBeenCalledWith("/debate/run%3Aaccepted");
  });

  it("PROV-01 mutation-proof: a user-edited risk tier is sent as ASKER, never MACHINE_DEFAULT", async () => {
    const initial = await renderRealNewDebatePageState();
    const riskSelect = findElement(initial.tree, (element) => element.type === "select" && element.props.id === "riskTier");
    expect(riskSelect).not.toBeNull();
    (riskSelect!.props as { onChange: (event: { target: { value: string } }) => void }).onChange({
      target: { value: "casual" }
    });

    hooks.beginRender();
    const { default: NewDebatePage } = await import("../../apps/v2-ui/app/new/page.js");
    const editedTree = evaluateElementTree(<NewDebatePage />);
    const form = findElement(editedTree, (element) => element.type === "form");
    expect(form).not.toBeNull();
    await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> }).onSubmit({ preventDefault: vi.fn() });

    expect(pageMocks.createDebate).toHaveBeenCalledOnce();
    expect(pageMocks.createDebate.mock.calls[0]![1]).toMatchObject({
      risk_tier: "casual",
      tier_source: "ASKER",
      tier_provenance_ref: "asker:ui-selection"
    });
    expect(pageMocks.createDebate.mock.calls[0]![1]).not.toMatchObject({ tier_source: "MACHINE_DEFAULT" });
  });

  it("DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page", async () => {
    const sessionsByToken: Record<string, Session> = {
      "token:test-user-alpha": session,
      "token:test-user-beta": {
        ...session,
        asker_id: "asker:test-user-beta",
        session_id: "session:test-user-beta"
      }
    };
    pageMocks.readSession.mockImplementation(async (token: string) => sessionsByToken[token]!);

    const submitBareStart = async (token: string) => {
      hooks.reset();
      pageMocks.authToken = token;
      const rendered = await renderRealNewDebatePageState();
      const form = findElement(rendered.tree, (element) => element.type === "form");
      expect(form).not.toBeNull();
      await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> }).onSubmit({ preventDefault: vi.fn() });
      return rendered.html;
    };

    const alphaHtml = await submitBareStart("token:test-user-alpha");
    const betaHtml = await submitBareStart("token:test-user-beta");

    expect(pageMocks.readSession).toHaveBeenCalledWith("token:test-user-alpha");
    expect(pageMocks.readSession).toHaveBeenCalledWith("token:test-user-beta");
    expect(pageMocks.createDebate).toHaveBeenCalledTimes(2);
    const [, alphaConfig, alphaToken] = pageMocks.createDebate.mock.calls[0]!;
    const [, betaConfig, betaToken] = pageMocks.createDebate.mock.calls[1]!;
    expect(alphaToken).toBe("token:test-user-alpha");
    expect(betaToken).toBe("token:test-user-beta");
    expect(alphaConfig).toMatchObject({
      decision_owner: "asker:test-user-alpha",
      action_owner: "asker:test-user-alpha"
    });
    expect(betaConfig).toMatchObject({
      decision_owner: "asker:test-user-beta",
      action_owner: "asker:test-user-beta"
    });
    expect((alphaConfig as { decision_owner: string }).decision_owner).not.toBe((betaConfig as { decision_owner: string }).decision_owner);
    expect((alphaConfig as { action_owner: string }).action_owner).not.toBe((betaConfig as { action_owner: string }).action_owner);
    for (const machineField of ["agentCount", "asOf", "decisionOwner", "actionOwner", "decisionScope"]) {
      expect(alphaHtml).not.toContain(`id="${machineField}"`);
      expect(betaHtml).not.toContain(`id="${machineField}"`);
    }
  });

  it.runIf(process.env.UX01_LIVE_STACK === "1")("LIVE READ-ONLY: standing deployment derives two makers and enables Start", async () => {
    const liveBaseUrl = process.env.UX01_LIVE_BASE_URL ?? "http://127.0.0.1:8790";
    const headers = { "x-user-dev-token": "v-dev" };
    const [deploymentResponse, sessionResponse] = await Promise.all([
      fetch(`${liveBaseUrl}/v1/deployment`, { headers }),
      fetch(`${liveBaseUrl}/v1/session`, { headers })
    ]);
    expect(deploymentResponse.status).toBe(200);
    expect(sessionResponse.status).toBe(200);
    pageMocks.readDeployment.mockResolvedValue(await deploymentResponse.json() as Deployment);
    pageMocks.readSession.mockResolvedValue(await sessionResponse.json() as Session);

    const html = await renderRealNewDebatePage();
    expect(html).toMatch(/<button type="submit" class="startBtn ready"(?![^>]*disabled)/);
    expect(html).not.toContain("ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE");
  });

  it("B5: renders honest field-local absence and stays disabled; fabricated fallback values die", async () => {
    pageMocks.readDeployment.mockResolvedValue({
      ...deployment,
      register: { ...deployment.register, rows: deployment.register.rows.filter((row) => row.row_key !== "configuredProviderSet") }
    });
    const html = await renderRealNewDebatePage();
    expect(html).toContain("ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE");
    expect(html).toContain('id="riskTier"');
    expect(html).toContain('value="standard" selected=""');
    expect(html).toMatch(/<button type="submit" class="startBtn" disabled=""/);
    expect(html).not.toContain('id="agentCount"');
  });

  it("keeps all five machine-owned values out of the real rendered form", async () => {
    const html = await renderRealNewDebatePage();
    for (const id of ["agentCount", "asOf", "decisionOwner", "actionOwner", "decisionScope"]) {
      expect(html, id).not.toContain(`id="${id}"`);
    }
  });

  it("B6: pins UTC while preserving an edited as_of instead of overwriting user intent", () => {
    expect(process.env.TZ).toBe("UTC");
    const config = buildNewDebateAskConfig({
      ...deriveAgentCountDefault(deployment),
      ...deriveRiskTierDefault(deployment),
      ...deriveSessionAskDefaults(session, new Date("2026-08-13T05:00:00.000Z")),
      budgetTier: PROVISIONAL_COMPOSITION_BUDGET_DEFAULT,
      depth: 2,
      asOf: "2026-08-14T09:30",
      asOfWasEdited: true
    }, new Date("2026-08-13T05:02:03.456Z"));
    expect(config.as_of).toBe("2026-08-14T09:30:00.000Z");
  });
});
