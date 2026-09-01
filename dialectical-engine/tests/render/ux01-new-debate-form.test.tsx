import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@debateai/contract";
import {
  PROVISIONAL_COMPOSITION_BUDGET_DEFAULT,
  buildNewDebateAskConfig,
  deriveSessionAskDefaults
} from "../../apps/ui/app/new/defaults.js";

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
  ...(await importOriginal<typeof import("../../apps/ui/lib/api.js")>()),
  contractClient: { readDeployment: pageMocks.readDeployment, readSession: pageMocks.readSession },
  createDebate: pageMocks.createDebate
}));

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
  const { default: NewDebatePage } = await import("../../apps/ui/app/new/page.js");
  let html = "";
  for (let pass = 0; pass < 4; pass += 1) {
    hooks.beginRender();
    html = renderToStaticMarkup(<NewDebatePage />);
    await hooks.flushEffects();
  }
  hooks.beginRender();
  return { html, tree: evaluateElementTree(<NewDebatePage />) };
}

/* Risk tier is a segmented pill group: the asker's choice arrives as a click
   on one radio-role button, not as a select's change event. */
function chooseRiskTier(tree: ReactNode, value: string): void {
  const pill = findElement(tree, (element) =>
    element.type === "button"
    && (element.props as Record<string, unknown>)["data-field"] === "riskTier"
    && (element.props as Record<string, unknown>)["data-value"] === value);
  expect(pill, `missing risk tier pill for ${value}`).not.toBeNull();
  (pill!.props as { onClick: () => void }).onClick();
}

async function submitRenderedPage(): Promise<Record<string, unknown>> {
  const initial = await renderRealNewDebatePageState();
  chooseRiskTier(initial.tree, "standard");
  hooks.beginRender();
  const { default: NewDebatePage } = await import("../../apps/ui/app/new/page.js");
  const rendered = { tree: evaluateElementTree(<NewDebatePage />) };
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
    pageMocks.readDeployment.mockReset();
    pageMocks.readSession.mockReset().mockResolvedValue(session);
    pageMocks.push.mockReset();
  });

  it("submits the complete discovery-owned ask without an agent-count field", async () => {
    const config = await submitRenderedPage();
    expect(config).toMatchObject({
      risk_tier: "standard",
      tier_source: "ASKER",
      tier_provenance_ref: "asker:ui-selection",
      composition_budget_tier: "low",
      depth: 1,
      decision_scope: "personal"
    });
    expect(config).not.toHaveProperty("agent_count");
    expect(config).not.toHaveProperty("decision_owner");
    expect(config).not.toHaveProperty("action_owner");
    expect(pageMocks.readDeployment).not.toHaveBeenCalled();
    expect(pageMocks.push).toHaveBeenCalledWith("/debate/run%3Anew?starting=1");
  });

  it("keeps the visible risk choice asker-owned through the real page", async () => {
    const initial = await renderRealNewDebatePageState();
    chooseRiskTier(initial.tree, "casual");
    hooks.beginRender();
    const { default: NewDebatePage } = await import("../../apps/ui/app/new/page.js");
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

  it("does not emit caller-supplied owner or privilege claims for any authenticated token", async () => {
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
    for (const config of [alpha, beta]) {
      expect(config).not.toHaveProperty("decision_owner");
      expect(config).not.toHaveProperty("action_owner");
      expect(config).not.toHaveProperty("caller_scope");
    }
  });

  it("B6 refreshes untouched as-of at submit and preserves an explicitly edited value", () => {
    const defaults = {
      ...deriveSessionAskDefaults(session, new Date("2026-08-13T05:00:00.000Z")),
      riskTier: "standard" as const,
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
    expect(initial.html).toMatch(/<button[^>]*class="ndOptionsToggle"[^>]*aria-expanded="false"[^>]*>⚙ OPTIONS/);
    expect(initial.html).not.toContain('aria-controls="additionalRunOptions"');
    expect(initial.html).not.toContain('id="additionalRunOptions"');
    const optionsButton = findElement(initial.tree, (element) =>
      element.type === "button" && element.props.className === "ndOptionsToggle"
    );
    expect(optionsButton).not.toBeNull();
    (optionsButton!.props as { onClick: () => void }).onClick();
    hooks.beginRender();
    const { default: NewDebatePage } = await import("../../apps/ui/app/new/page.js");
    const openHtml = renderToStaticMarkup(<NewDebatePage />);
    expect(openHtml).toContain('aria-controls="additionalRunOptions"');
    expect(openHtml).toContain('id="additionalRunOptions"');
  });

  it("carries the two steering fields into the ask as trimmed non-empty lines", async () => {
    const initial = await renderRealNewDebatePageState();
    chooseRiskTier(initial.tree, "standard");
    const write = (id: string, value: string) => {
      const field = findElement(initial.tree, (element) =>
        element.type === "textarea" && (element.props as { id?: string }).id === id);
      expect(field, `missing ${id} field`).not.toBeNull();
      // The auto-growing fields read currentTarget, so the event has to carry a
      // node-shaped target rather than a bare value bag.
      const node = { value, style: { height: "" }, scrollHeight: 50 };
      (field!.props as { onChange: (event: unknown) => void })
        .onChange({ target: node, currentTarget: node });
    };
    write("steeringPresets", "Prefer primary sources\n\n  Surface the strongest counter-case early  ");
    write("steeringAnnotations", "Add a note the run will carry\n   ");
    hooks.beginRender();
    const { default: NewDebatePage } = await import("../../apps/ui/app/new/page.js");
    const form = findElement(evaluateElementTree(<NewDebatePage />), (element) => element.type === "form");
    expect(form).not.toBeNull();
    await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> })
      .onSubmit({ preventDefault: vi.fn() });
    expect(pageMocks.createDebate.mock.calls.at(-1)![1]).toMatchObject({
      steering_presets: ["Prefer primary sources", "Surface the strongest counter-case early"],
      steering_annotations: ["Add a note the run will carry"]
    });
  });

  it("sends empty steering lists when the asker steers nothing", async () => {
    const config = await submitRenderedPage();
    expect(config).toMatchObject({ steering_presets: [], steering_annotations: [] });
  });

  it("renders depth 1..5 while keeping retired apparatus and all machine-owned fields out of the DOM", async () => {
    const { html } = await renderRealNewDebatePageState();
    expect(html).toMatch(/<input[^>]*id="treeDepth"[^>]*type="range"[^>]*min="1"[^>]*max="5"/);
    for (const retired of ["agentCount", "runCostEnvelope", "maxModelAttempts", "models found", "machineOwnedAskFields"]) {
      expect(html).not.toContain(retired);
    }
    for (const id of ["agentCount", "asOf", "decisionOwner", "actionOwner", "decisionScope"]) {
      expect(html).not.toContain(`id="${id}"`);
    }
  });
});
