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

function collectElements(node: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => collectElements(child, predicate));
  if (!isValidElement(node)) return [];
  const children = collectElements((node.props as { children?: ReactNode }).children, predicate);
  return predicate(node) ? [node, ...children] : children;
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

  /* S1-2 · V ruling 2026-09-03, applied during the W5 dev reconciliation.

     PROPERTY: no asker-facing control on this form can put text into
     `steering_presets` or `steering_annotations`. Both reach the ask as empty
     arrays whatever the asker types, while the two contract fields stay PRESENT
     so already-stored asks remain valid.

     WHY THE CONTROL WAS REMOVED, TWICE. The steering inputs were collected and
     DISCARDED. Nothing downstream reads either field — not propagation, not
     judgement, not serve, not the runner; the API persists them and no consumer
     ever looks. A control that appears to steer a debate it cannot steer is
     worse than no control, because it invites the asker to spend care on it.
     The mission removed it from the legacy web/ form under goal task T2; the UI
     overhaul then rebuilt it here, on a form that survived while the legacy one
     was deleted. V ruled it out a second time rather than let the merge ship it.

     This assertion is written against EVERY text control the form renders, not
     against the two ids that were removed, so a steering box re-added under a
     different name fails here too.

     If you are here because you want to add steering: it needs a design in which
     the value actually reaches the debate — that is its own mission, and the
     goal's non-goals exclude it. This test is the record of two removals, not an
     obstacle to route around. */
  it("offers no steering control, and sends empty steering lists whatever the asker types", async () => {
    const initial = await renderRealNewDebatePageState();
    chooseRiskTier(initial.tree, "standard");

    expect(initial.html).not.toMatch(/steering/i);
    expect(collectElements(initial.tree, (element) =>
      /steer/i.test(String((element.props as { id?: string }).id ?? "")))).toEqual([]);

    // Fill every free-text control the form still renders with one sentinel.
    const SENTINEL = "asker-typed-steering-text";
    const textControls = collectElements(initial.tree, (element) => element.type === "textarea");
    for (const field of textControls) {
      const node = { value: SENTINEL, style: { height: "" }, scrollHeight: 50 };
      (field.props as { onChange?: (event: unknown) => void })
        .onChange?.({ target: node, currentTarget: node });
    }

    hooks.beginRender();
    const { default: NewDebatePage } = await import("../../apps/ui/app/new/page.js");
    const form = findElement(evaluateElementTree(<NewDebatePage />), (element) => element.type === "form");
    expect(form).not.toBeNull();
    await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> })
      .onSubmit({ preventDefault: vi.fn() });

    const config = pageMocks.createDebate.mock.calls.at(-1)![1] as Record<string, unknown>;
    expect(Object.keys(config)).toEqual(
      expect.arrayContaining(["steering_presets", "steering_annotations"])
    );
    expect(config).toMatchObject({ steering_presets: [], steering_annotations: [] });
    // Generalised over naming rather than over the whole config: a steering box
    // re-added under a new key is still caught, while an unrelated future text
    // field that legitimately feeds the ask is not a failure of THIS property.
    const steeringKeys = Object.keys(config).filter((key) => /steer/i.test(key)).sort();
    expect(steeringKeys).toEqual(["steering_annotations", "steering_presets"]);
    for (const key of steeringKeys) {
      expect(JSON.stringify(config[key]), `${key} carried asker text`).not.toContain(SENTINEL);
    }
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
