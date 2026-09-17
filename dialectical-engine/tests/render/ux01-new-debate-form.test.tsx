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
     Reworked in round 3 after codex B1 (w5-codex-r1.md).

     PROPERTY (the substantive one, asserted by the first test below): text an
     asker types into ANY editable text control this form renders — in either
     reachable state of the form, Options closed and Options open — never
     reaches `steering_presets` or `steering_annotations`. Both arrive at the
     ask as empty arrays, while the two contract fields stay PRESENT so
     already-stored asks remain valid.

     WHAT THE CLAIM IS LIMITED TO, precisely. The enumeration selects controls
     by ELEMENT SHAPE — `textarea`, and `input` whose `type` is a text-entry
     type — never by anything about their name, id, or label. So a steering
     control re-added under any spelling is filled and caught. It does NOT
     cover shapes this test cannot type into: contenteditable hosts, custom
     widgets that take text without a text-entry element, file or date inputs.
     The second test below pins the absence of the one shape that would
     silently escape (contenteditable), so the enumeration is complete for what
     this form can render — but if a future control takes asker text through
     some other shape, this test does not see it. That is the honest boundary.

     WHY THE CONTROL WAS REMOVED, TWICE. The steering inputs were collected and
     DISCARDED. Nothing downstream reads either field — not propagation, not
     judgement, not serve, not the runner; the API persists them and no consumer
     ever looks. A control that appears to steer a debate it cannot steer is
     worse than no control, because it invites the asker to spend care on it.
     The mission removed it from the legacy web/ form under goal task T2; the UI
     overhaul then rebuilt it here, on a form that survived while the legacy one
     was deleted. V ruled it out a second time rather than let the merge ship it.

     If you are here because you want to add steering: it needs a design in which
     the value actually reaches the debate — that is its own mission, and the
     goal's non-goals exclude it. This test is the record of two removals, not an
     obstacle to route around. */

  /* Text-entry `input` types, plus the absent/implicit default. `range`,
     `checkbox`, `radio`, `file`, `date`, `hidden` and friends are excluded
     because a change event on them does not carry asker prose. */
  const TEXT_ENTRY_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "password"]);

  function isEditableTextControl(element: ReactElement): boolean {
    if (element.type === "textarea") return true;
    if (element.type !== "input") return false;
    const type = String((element.props as { type?: unknown }).type ?? "").toLowerCase();
    return TEXT_ENTRY_INPUT_TYPES.has(type);
  }

  /* Types one distinct sentinel into every editable text control in the tree,
     by shape. Returns the sentinels actually typed, so a test can prove the
     harness typed at all instead of passing vacuously on an empty enumeration. */
  function typeIntoEveryTextControl(tree: ReactNode, tag: string): string[] {
    const controls = collectElements(tree, isEditableTextControl);
    return controls.map((field, index) => {
      const sentinel = `asker-typed-${tag}-${index}`;
      const node = { value: sentinel, style: { height: "" }, scrollHeight: 50 };
      (field.props as { onChange?: (event: unknown) => void })
        .onChange?.({ target: node, currentTarget: node });
      return sentinel;
    });
  }

  function openOptionsPanel(tree: ReactNode): void {
    const toggle = findElement(tree, (element) =>
      element.type === "button" && (element.props as { className?: string }).className === "ndOptionsToggle");
    expect(toggle, "Options toggle missing — the panel state is no longer reachable").not.toBeNull();
    (toggle!.props as { onClick: () => void }).onClick();
  }

  it("sends empty steering lists whatever the asker types into any text control, in either form state", async () => {
    const initial = await renderRealNewDebatePageState();
    chooseRiskTier(initial.tree, "standard");

    // STATE 1 — Options closed.
    const closedSentinels = typeIntoEveryTextControl(initial.tree, "closed");
    expect(closedSentinels.length, "no editable text control found with Options closed").toBeGreaterThan(0);

    // STATE 2 — Options open. Controls inside the panel only exist in this
    // state; codex's counterexample hid there precisely because the old test
    // never opened it.
    openOptionsPanel(initial.tree);
    hooks.beginRender();
    const { default: NewDebatePage } = await import("../../apps/ui/app/new/page.js");
    const openTree = evaluateElementTree(<NewDebatePage />);
    expect(
      findElement(openTree, (element) => (element.props as { id?: string }).id === "additionalRunOptions"),
      "Options panel did not open — controls inside it would go unexercised"
    ).not.toBeNull();
    const openSentinels = typeIntoEveryTextControl(openTree, "open");
    expect(openSentinels.length, "no editable text control found with Options open").toBeGreaterThan(0);

    hooks.beginRender();
    const form = findElement(evaluateElementTree(<NewDebatePage />), (element) => element.type === "form");
    expect(form).not.toBeNull();
    await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> })
      .onSubmit({ preventDefault: vi.fn() });

    const call = pageMocks.createDebate.mock.calls.at(-1)!;
    const config = call[1] as Record<string, unknown>;
    const everySentinel = [...closedSentinels, ...openSentinels];

    // POSITIVE CONTROL, and the guard against a vacuous pass: one legitimate
    // field really does carry asker text to the ask. If the harness ever stops
    // typing, this fails and the steering assertions stop being meaningful in
    // silence. Identified by where its value LANDS, not by its name.
    expect(everySentinel, "no typed value reached the ask — the harness typed nothing")
      .toContain(String(call[0]));

    // The two contract fields stay present and empty.
    expect(Object.keys(config)).toEqual(
      expect.arrayContaining(["steering_presets", "steering_annotations"])
    );
    expect(config).toMatchObject({ steering_presets: [], steering_annotations: [] });

    // THE SUBSTANTIVE ASSERTION. Generalised over the CONTROL's name — the
    // enumeration above selected by shape, so a steering box re-added under any
    // spelling, in either state, was typed into — and scoped on the SINK side to
    // the steering fields: the two canonical contract names, plus any further
    // key spelt like steering. It is deliberately NOT a sweep of the whole
    // config: an unrelated future field that legitimately carries asker text is
    // not a violation of THIS property, and asserting over every key would fire
    // on it (round 2 corrected exactly that over-broadness; m3 re-proves it).
    const steeringKeys = [...new Set([
      "steering_presets",
      "steering_annotations",
      ...Object.keys(config).filter((key) => /steer/i.test(key))
    ])].sort();
    expect(steeringKeys).toEqual(["steering_annotations", "steering_presets"]);
    for (const key of steeringKeys) {
      for (const sentinel of everySentinel) {
        expect(JSON.stringify(config[key]) ?? "", `${key} carried asker text typed into a form control`)
          .not.toContain(sentinel);
      }
    }
  });

  it("renders no steering-named control and no shape this enumeration cannot type into", async () => {
    const initial = await renderRealNewDebatePageState();

    // Weaker, separate claim about SPELLING. Kept apart from the property above
    // so a mutant that adds a differently-named control fails the substantive
    // test rather than dying here on a name check — which is exactly what made
    // the round-2 m2 evidence unsound (codex B1).
    expect(initial.html).not.toMatch(/steering/i);
    expect(collectElements(initial.tree, (element) =>
      /steer/i.test(String((element.props as { id?: string }).id ?? "")))).toEqual([]);

    // Completeness of the shape enumeration: no contenteditable host, in either
    // state, so "every editable text control" above is not silently partial.
    openOptionsPanel(initial.tree);
    hooks.beginRender();
    const { default: NewDebatePage } = await import("../../apps/ui/app/new/page.js");
    for (const tree of [initial.tree, evaluateElementTree(<NewDebatePage />)]) {
      expect(collectElements(tree, (element) => {
        const editable = (element.props as { contentEditable?: unknown }).contentEditable;
        return editable === true || editable === "true" || editable === "plaintext-only";
      })).toEqual([]);
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
