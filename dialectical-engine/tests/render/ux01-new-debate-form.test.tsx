import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@debateai/contract";
import {
  PROVISIONAL_COMPOSITION_BUDGET_DEFAULT,
  buildNewDebateAskConfig,
  deriveSessionAskDefaults
} from "../../apps/ui/app/new/defaults.js";
import NewDebatePage from "../../apps/ui/app/new/NewDebatePageClient.js";
import homeCatalog from "../../apps/ui/messages/en/home.json" with { type: "json" };
import newDebateCatalog from "../../apps/ui/messages/en/newDebate.json" with { type: "json" };

process.env.TZ = "UTC";

const pageMocks = vi.hoisted(() => ({
  authToken: "token:test-user-alpha",
  contractClientHasPlanTierReader: true,
  createDebate: vi.fn(),
  readDeployment: vi.fn(),
  readPlanTiers: vi.fn(),
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
    // Client components reached by this walker may hold refs (the merge mounted
    // SupportWidget, which holds three). A ref is one slot that survives re-renders,
    // so it uses the same cursor discipline as useState and is cleared by reset().
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
vi.mock("@/lib/api", async (importOriginal) => {
  const contractClient = {
    readDeployment: pageMocks.readDeployment,
    readPlanTiers: pageMocks.readPlanTiers,
    readSession: pageMocks.readSession
  };
  return {
    ...(await importOriginal<typeof import("../../apps/ui/lib/api.js")>()),
    contractClient: new Proxy(contractClient, {
      get(target, property, receiver) {
        if (property === "readPlanTiers" && !pageMocks.contractClientHasPlanTierReader) return undefined;
        return Reflect.get(target, property, receiver);
      }
    }),
    createDebate: pageMocks.createDebate
  };
});

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

function collectElements(node: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => collectElements(child, predicate));
  if (!isValidElement(node)) return [];
  const children = collectElements((node.props as { children?: ReactNode }).children, predicate);
  return predicate(node) ? [node, ...children] : children;
}

async function renderRealNewDebatePageState(): Promise<{ html: string; tree: ReactNode }> {
  let html = "";
  for (let pass = 0; pass < 4; pass += 1) {
    hooks.beginRender();
    html = renderToStaticMarkup(<NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} />);
    await hooks.flushEffects();
  }
  hooks.beginRender();
  return {
    html,
    tree: evaluateElementTree(<NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} />)
  };
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
  const rendered = {
    tree: evaluateElementTree(<NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} />)
  };
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
    pageMocks.contractClientHasPlanTierReader = true;
    pageMocks.createDebate.mockReset().mockResolvedValue({ id: "run:new" });
    pageMocks.readDeployment.mockReset();
    pageMocks.readPlanTiers.mockReset().mockResolvedValue({ free: [], premium: [] });
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
      // V-12: M10 supersedes dev's depth-1 default with Free depth 2.
      depth: 2,
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
    const editedTree = evaluateElementTree(
      <NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} />
    );
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
    const openHtml = renderToStaticMarkup(
      <NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} />
    );
    expect(openHtml).toContain('aria-controls="additionalRunOptions"');
    expect(openHtml).toContain('id="additionalRunOptions"');
  });

  /* S1-2 was superseded by V-12: the later DONE(S01) ruling keeps both
     steering boxes for every client shape. Free owns their empty defaults and
     native lock; Premium makes the same fields editable and carries their text. */
  it("V-12 renders both empty steering boxes locked on Free for a client without readPlanTiers", async () => {
    pageMocks.contractClientHasPlanTierReader = false;
    try {
      hooks.beginRender();
      const tree = evaluateElementTree(
        <NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} />
      );
      const steering = collectElements(tree, (element) =>
        ["steeringPresets", "steeringAnnotations"].includes(
          String((element.props as { id?: string }).id ?? "")
        ));

      // V-12: both controls exist independently of the mocked client's methods.
      expect(steering.map((element) => (element.props as { id?: string }).id)).toEqual([
        "steeringPresets",
        "steeringAnnotations"
      ]);
      // V-12: Free applies the native lock to both controls.
      expect(steering.every((element) => (element.props as { disabled?: boolean }).disabled === true)).toBe(true);
      // V-12: M10 opens with both steering defaults empty.
      expect(steering.map((element) => (element.props as { value?: string }).value)).toEqual(["", ""]);
      const depth = findElement(tree, (element) => (element.props as { id?: string }).id === "treeDepth");
      // V-12: M10 opens Free at Tree depth 2.
      expect((depth?.props as { value?: number }).value).toBe(2);
    } finally {
      pageMocks.contractClientHasPlanTierReader = true;
    }
  });

  it("V-12 enables both steering boxes on Premium and carries their text", async () => {
    const initial = await renderRealNewDebatePageState();
    const premium = findElement(initial.tree, (element) =>
      (element.props as Record<string, unknown>)["data-field"] === "planTier"
      && (element.props as Record<string, unknown>)["data-value"] === "premium");
    // V-12: Premium remains a reachable tier from the same screen.
    expect(premium).not.toBeNull();
    (premium!.props as { onClick: () => void }).onClick();

    hooks.beginRender();
    const premiumTree = evaluateElementTree(
      <NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} />
    );
    const steering = collectElements(premiumTree, (element) =>
      ["steeringPresets", "steeringAnnotations"].includes(
        String((element.props as { id?: string }).id ?? "")
      ));
    // V-12: Premium exposes both textareas without the Free lock.
    expect(steering).toHaveLength(2);
    // V-12: neither Premium textarea is disabled.
    expect(steering.every((element) => (element.props as { disabled?: boolean }).disabled !== true)).toBe(true);

    const typed = ["Prefer primary sources", "Flag unsupported claims"];
    steering.forEach((field, index) => {
      const node = { value: typed[index], style: { height: "" }, scrollHeight: 50 };
      (field.props as { onChange: (event: unknown) => void }).onChange({ target: node, currentTarget: node });
    });
    hooks.beginRender();
    const form = findElement(
      evaluateElementTree(<NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} />),
      (element) => element.type === "form"
    );
    // V-12: the rendered Premium screen still has its real submit boundary.
    expect(form).not.toBeNull();
    await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> })
      .onSubmit({ preventDefault: vi.fn() });
    const config = pageMocks.createDebate.mock.calls.at(-1)![1] as Record<string, unknown>;
    // V-12: Premium carries the two independently derived literal values.
    expect(config).toMatchObject({
      steering_presets: ["Prefer primary sources"],
      steering_annotations: ["Flag unsupported claims"]
    });
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
