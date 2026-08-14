import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deployment, Session } from "@debateai/contract";
import {
  PROVISIONAL_COMPOSITION_BUDGET_DEFAULT,
  buildNewDebateAskConfig,
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
    left !== undefined && right !== undefined && left.length === right.length
      && left.every((value, index) => Object.is(value, right[index]));
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
  contractClient: { readDeployment: pageMocks.readDeployment, readSession: pageMocks.readSession },
  createDebate: pageMocks.createDebate
}));

const deployment = {
  register: {
    register_version: 8,
    rows: [{ row_key: "riskTier", value: "standard", source_ref: "register:test:risk" }]
  },
  scorecards: [],
  model_ledger: [],
  fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
} as Deployment;

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

async function renderRealNewDebatePageState(): Promise<{ html: string; tree: ReactNode }> {
  const { default: NewDebatePage } = await import("../../apps/v2-ui/app/new/page.js");
  let html = "";
  for (let pass = 0; pass < 4; pass += 1) {
    hooks.beginRender();
    html = renderToStaticMarkup(<NewDebatePage />);
    await hooks.flushEffects();
  }
  hooks.beginRender();
  return { html, tree: evaluateElementTree(<NewDebatePage />) };
}

async function submitRenderedPage(): Promise<Record<string, unknown>> {
  const rendered = await renderRealNewDebatePageState();
  const form = findElement(rendered.tree, (element) => element.type === "form");
  expect(form).not.toBeNull();
  await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> })
    .onSubmit({ preventDefault: vi.fn() });
  expect(pageMocks.createDebate).toHaveBeenCalled();
  return pageMocks.createDebate.mock.calls.at(-1)![1] as Record<string, unknown>;
}

describe("UX-01 DR-181 discovery-owned rendered /new flow", () => {
  beforeEach(() => {
    hooks.reset();
    pageMocks.authToken = "token:test-user-alpha";
    pageMocks.createDebate.mockReset().mockResolvedValue({ id: "run:new" });
    pageMocks.readDeployment.mockReset().mockResolvedValue(deployment);
    pageMocks.readSession.mockReset().mockResolvedValue(session);
    pageMocks.push.mockReset();
  });

  it("submits the complete discovery-owned ask without an agent-count field", async () => {
    const config = await submitRenderedPage();
    expect(config).toMatchObject({
      risk_tier: "standard",
      tier_source: "MACHINE_DEFAULT",
      tier_provenance_ref: "machine:deployment-floor",
      composition_budget_tier: "low",
      depth: 1,
      decision_owner: "asker:test-user-alpha",
      action_owner: "asker:test-user-alpha",
      decision_scope: "personal"
    });
    expect(config).not.toHaveProperty("agent_count");
  });

  it("PROV-01 keeps untouched risk machine-defaulted and edited risk asker-owned through the real page", async () => {
    const untouched = await submitRenderedPage();
    expect(untouched).toMatchObject({
      tier_source: "MACHINE_DEFAULT",
      tier_provenance_ref: "machine:deployment-floor"
    });

    pageMocks.createDebate.mockClear();
    const initial = await renderRealNewDebatePageState();
    const riskSelect = findElement(initial.tree, (element) => element.type === "select" && element.props.id === "riskTier");
    expect(riskSelect).not.toBeNull();
    (riskSelect!.props as { onChange: (event: { target: { value: string } }) => void })
      .onChange({ target: { value: "casual" } });
    hooks.beginRender();
    const { default: NewDebatePage } = await import("../../apps/v2-ui/app/new/page.js");
    const editedTree = evaluateElementTree(<NewDebatePage />);
    const form = findElement(editedTree, (element) => element.type === "form");
    expect(form).not.toBeNull();
    await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> })
      .onSubmit({ preventDefault: vi.fn() });
    expect(pageMocks.createDebate.mock.calls[0]![1]).toMatchObject({
      risk_tier: "casual",
      tier_source: "ASKER",
      tier_provenance_ref: "asker:ui-selection"
    });
  });

  it("DR-166-A derives distinct decision and action owners for two authenticated tokens through the real page", async () => {
    const sessionsByToken: Record<string, Session> = {
      "token:test-user-alpha": session,
      "token:test-user-beta": { ...session, asker_id: "asker:test-user-beta", session_id: "session:test-user-beta" }
    };
    pageMocks.readSession.mockImplementation(async (token: string) => sessionsByToken[token]!);

    const submitFor = async (token: string) => {
      hooks.reset();
      pageMocks.authToken = token;
      return submitRenderedPage();
    };
    const alpha = await submitFor("token:test-user-alpha");
    const beta = await submitFor("token:test-user-beta");
    expect(alpha).toMatchObject({ decision_owner: "asker:test-user-alpha", action_owner: "asker:test-user-alpha" });
    expect(beta).toMatchObject({ decision_owner: "asker:test-user-beta", action_owner: "asker:test-user-beta" });
    expect(alpha.decision_owner).not.toBe(beta.decision_owner);
    expect(alpha.action_owner).not.toBe(beta.action_owner);
  });

  it("B6 refreshes untouched as-of at submit and preserves an explicitly edited value", () => {
    const defaults = {
      ...deriveRiskTierDefault(deployment),
      ...deriveSessionAskDefaults(session, new Date("2026-08-13T05:00:00.000Z")),
      budgetTier: PROVISIONAL_COMPOSITION_BUDGET_DEFAULT,
      depth: 1
    };
    expect(buildNewDebateAskConfig({ ...defaults, asOfWasEdited: false }, new Date("2026-08-13T05:02:03.456Z")).as_of)
      .toBe("2026-08-13T05:02:03.456Z");
    expect(buildNewDebateAskConfig({
      ...defaults,
      asOf: "2026-08-14T09:30",
      asOfWasEdited: true
    }, new Date("2026-08-13T05:02:03.456Z")).as_of).toBe("2026-08-14T09:30:00.000Z");
  });

  it("R3 exposes aria-controls exactly while the rendered Options panel exists", async () => {
    const initial = await renderRealNewDebatePageState();
    expect(initial.html).toMatch(/<button[^>]*class="optionsToggle"[^>]*aria-expanded="false"[^>]*>Options/);
    expect(initial.html).not.toContain('aria-controls="additionalRunOptions"');
    expect(initial.html).not.toContain('id="additionalRunOptions"');
    const optionsButton = findElement(initial.tree, (element) =>
      element.type === "button" && element.props.className === "optionsToggle"
    );
    expect(optionsButton).not.toBeNull();
    (optionsButton!.props as { onClick: () => void }).onClick();
    hooks.beginRender();
    const { default: NewDebatePage } = await import("../../apps/v2-ui/app/new/page.js");
    const openHtml = renderToStaticMarkup(<NewDebatePage />);
    expect(openHtml).toContain('aria-controls="additionalRunOptions"');
    expect(openHtml).toContain('id="additionalRunOptions"');
  });

  it("renders depth 1..5 while keeping retired apparatus and all machine-owned fields out of the DOM", async () => {
    const { html } = await renderRealNewDebatePageState();
    for (const value of [1, 2, 3, 4, 5]) expect(html).toContain(`<option value="${value}"`);
    for (const retired of ["agentCount", "runCostEnvelope", "maxModelAttempts", "models found", "machineOwnedAskFields"]) {
      expect(html).not.toContain(retired);
    }
    for (const id of ["agentCount", "asOf", "decisionOwner", "actionOwner", "decisionScope"]) {
      expect(html).not.toContain(`id="${id}"`);
    }
  });
});
