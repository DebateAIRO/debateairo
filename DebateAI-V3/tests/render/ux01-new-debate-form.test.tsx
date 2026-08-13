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
          members: [{ depth_params: { depth: 2 }, risk_tier: "standard", max_model_attempts: 66 }]
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

async function renderRealNewDebatePageState({ advanced = false }: { advanced?: boolean } = {}): Promise<{
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
  if (advanced) {
    const advancedButton = findElement(
      tree,
      (element) => element.type === "button" && textContent((element.props as { children?: ReactNode }).children).includes("Advanced")
    );
    expect(advancedButton).not.toBeNull();
    (advancedButton!.props as { onClick: () => void }).onClick();
    hooks.beginRender();
    html = renderToStaticMarkup(<NewDebatePage />);
    await hooks.flushEffects();
    hooks.beginRender();
    tree = evaluateElementTree(<NewDebatePage />);
  }
  return { html, tree };
}

async function renderRealNewDebatePage(options: { advanced?: boolean } = {}): Promise<string> {
  return (await renderRealNewDebatePageState(options)).html;
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

  it("B1/B3 + MUTATION agent_count: derives the two configured makers and ignores routing task classes", () => {
    expect(deriveAgentCountDefault(deployment)).toEqual({
      agentCount: "2",
      agentCountProvenance: "configuredProviderSet@8:acceptance:DR-140:V-approved (Anthropic, OpenAI)"
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
    expect(deriveAgentCountDefault(expandedDeployment).agentCount).toBe("3");
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
    const html = await renderRealNewDebatePage({ advanced: true });
    expect(html).toContain("ASK_RISK_TIER_DEFAULT_UNAVAILABLE");
    expect(html).toMatch(/<input[^>]*id="agentCount"[^>]*value="2"[^>]*>/);
    expect(html).toContain("configuredProviderSet@8:acceptance:DR-140:V-approved");
    expect(html).toMatch(/<select[^>]*id="riskTier"[^>]*><option value="" selected="">/);
    expect(html).toContain("Choose a risk tier with a ruled run-cost envelope before starting.");
    expect(html).toMatch(/<button type="submit" class="startBtn" disabled=""/);
  });

  it("B2/B5: an absent run envelope leaves provider and risk derivations intact without fabricating depth", async () => {
    pageMocks.readDeployment.mockResolvedValue({
      ...deployment,
      register: { ...deployment.register, rows: deployment.register.rows.filter((row) => row.row_key !== "runCostEnvelope") }
    });
    const html = await renderRealNewDebatePage({ advanced: true });
    expect(html).toMatch(/<input[^>]*id="agentCount"[^>]*value="2"[^>]*>/);
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

  it("B4/DR-166-B expanded: Advanced reveals every prefilled field and keeps Start enabled", async () => {
    const html = await renderRealNewDebatePage({ advanced: true });
    expect(html).toMatch(/<button[^>]*aria-expanded="true"[^>]*aria-controls="machineOwnedAskFields"[^>]*>Advanced/);
    expect(html).toContain('id="machineOwnedAskFields"');
    expect(html).toContain('id="agentCount"');
    expect(html).toContain('value="2"');
    expect(html).toContain('value="asker:test-user-alpha"');
    expect(html).toContain('value="personal"');
    expect(html).toContain("configuredProviderSet@8:acceptance:DR-140:V-approved (Anthropic, OpenAI)");
    expect(html).toContain('id="budgetTier"');
    expect(html).toContain('value="low" selected=""');
    expect(html).toMatch(/<button type="submit" class="startBtn ready"(?![^>]*disabled)/);
    expect(html).not.toContain("ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE");
  });

  it("DR-166-B + MUTATION visible-by-default: hides all five machine-owned controls until Advanced opens", async () => {
    const html = await renderRealNewDebatePage();
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Advanced/);
    expect(html).not.toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="machineOwnedAskFields"/);
    expect(html).not.toContain('id="machineOwnedAskFields"');
    expect(html).toContain('id="riskTier"');
    expect(html).toContain('id="budgetTier"');
    expect(html).toContain('id="treeDepth"');
    expect(html).toContain("Choose your risk tier, composition budget tier, and depth, then click Start.");
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Options/);
    expect(html).not.toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="additionalRunOptions"/);
    expect(html).not.toContain('id="additionalRunOptions"');
    expect(html).toMatch(/<button type="submit" class="startBtn ready"(?![^>]*disabled)/);
    for (const id of ["agentCount", "asOf", "decisionOwner", "actionOwner", "decisionScope"]) {
      expect(html, id).not.toContain(`id="${id}"`);
    }
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

    pageMocks.authToken = "token:test-user-alpha";
    const alphaHtml = await renderRealNewDebatePage({ advanced: true });
    hooks.reset();
    pageMocks.authToken = "token:test-user-beta";
    const betaHtml = await renderRealNewDebatePage({ advanced: true });

    expect(pageMocks.readSession).toHaveBeenCalledWith("token:test-user-alpha");
    expect(pageMocks.readSession).toHaveBeenCalledWith("token:test-user-beta");
    for (const ownerField of ["decisionOwner", "actionOwner"]) {
      expect(alphaHtml).toMatch(new RegExp(`<input[^>]*id="${ownerField}"[^>]*value="asker:test-user-alpha"[^>]*>`));
      expect(betaHtml).toMatch(new RegExp(`<input[^>]*id="${ownerField}"[^>]*value="asker:test-user-beta"[^>]*>`));
    }
    expect(alphaHtml).not.toContain('value="asker:test-user-beta"');
    expect(betaHtml).not.toContain('value="asker:test-user-alpha"');
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

    const html = await renderRealNewDebatePage({ advanced: true });
    expect(html).toContain("configuredProviderSet@1:acceptance:DR-140:V-approved (Anthropic, OpenAI)");
    expect(html).toMatch(/<input[^>]*id="agentCount"[^>]*value="2"[^>]*>/);
    expect(html).toMatch(/<button type="submit" class="startBtn ready"(?![^>]*disabled)/);
    expect(html).not.toContain("ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE");
  });

  it("B5: renders honest field-local absence and stays disabled; fabricated fallback values die", async () => {
    pageMocks.readDeployment.mockResolvedValue({
      ...deployment,
      register: { ...deployment.register, rows: deployment.register.rows.filter((row) => row.row_key !== "configuredProviderSet") }
    });
    const html = await renderRealNewDebatePage({ advanced: true });
    expect(html).toContain("ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE");
    expect(html).toMatch(/<input[^>]*id="agentCount"[^>]*value=""[^>]*>/);
    expect(html).toContain('id="riskTier"');
    expect(html).toContain('value="standard" selected=""');
    expect(html).toMatch(/<button type="submit" class="startBtn" disabled=""/);
    expect(html).not.toMatch(/<input[^>]*id="agentCount"[^>]*value="2"[^>]*>/);
  });

  it("keeps all five machine-owned controls editable in the real rendered form", async () => {
    const html = await renderRealNewDebatePage({ advanced: true });
    for (const id of ["agentCount", "asOf", "decisionOwner", "actionOwner", "decisionScope"]) {
      const control = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
      expect(control, id).toBeDefined();
      expect(control, id).not.toContain("readonly");
      expect(control, id).not.toContain("disabled");
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
