/* REV-MERGE-DEV-p2 promoted probe — /new steering measured against RULED behaviour (V-12).
   HEAD IT WAS WRITTEN AGAINST: 478b0ca0 (rework of the origin/dev merge df06aedf).
   It is a POSITIVE oracle: all four cases are expected to PASS at 478b0ca0.
   It supersedes probes/REV-MERGE-DEV/rev-steering-refutation.test.tsx, which encoded
   dev's S1-2 expectations that V-12 overturned.
   HOW TO RUN, from any worktree root R:
     cp this file to R/tests/render/zz-revmergedev-p2-steering.test.tsx
     (cd R && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec vitest run tests/render/zz-revmergedev-p2-steering.test.tsx)
     then DELETE the copy — it captures no state and restores nothing.
   Its client doubles are PLAIN OBJECTS, deliberately not the author's Proxy. */
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
    contractClient: pageMocks.contractClientHasPlanTierReader
      ? { readDeployment: pageMocks.readDeployment, readPlanTiers: pageMocks.readPlanTiers, readSession: pageMocks.readSession }
      : { readDeployment: pageMocks.readDeployment, readSession: pageMocks.readSession },
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


/* REV-MERGE-DEV-p2 charge 1 — the /new steering controls measured against the RULED
   behaviour (V-12: both boxes for EVERY client; Free locked + empty, Tree depth 2;
   Premium typeable and carried). This REPLACES my pass-1 refutation, which hard-coded
   dev's superseded S1-2 expectations. The one essential property is kept and is now the
   DEFAULT rather than the exception: the page renders against a client shaped like the
   SHIPPED one. My client doubles are two PLAIN OBJECTS, not the author's Proxy. */
const steeringFields = (tree: ReactNode) => collectElements(tree, (element) =>
  ["steeringPresets", "steeringAnnotations"].includes(String((element.props as { id?: string }).id ?? "")));

function openOptions(tree: ReactNode): void {
  const toggle = findElement(tree, (element) =>
    element.type === "button" && (element.props as { className?: string }).className === "ndOptionsToggle");
  expect(toggle, "Options toggle missing").not.toBeNull();
  (toggle!.props as { onClick: () => void }).onClick();
}

function choosePlanTier(tree: ReactNode, value: string): void {
  const pill = findElement(tree, (element) =>
    (element.props as Record<string, unknown>)["data-field"] === "planTier"
    && String((element.props as Record<string, unknown>)["data-value"] ?? "") === value);
  expect(pill, `missing plan tier control for ${value}`).not.toBeNull();
  (pill!.props as { onClick: () => void }).onClick();
}

async function reRender(): Promise<ReactNode> {
  hooks.beginRender();
  const { default: NewDebatePage } = await import("../../apps/ui/app/new/page.js");
  return evaluateElementTree(<NewDebatePage />);
}

describe("REV-MERGE-DEV-p2 · /new steering under V-12, both client shapes", () => {
  beforeEach(() => {
    hooks.reset();
    pageMocks.authToken = "token:test-user-alpha";
    pageMocks.contractClientHasPlanTierReader = true;
    pageMocks.createDebate.mockReset().mockResolvedValue({ id: "run:new" });
    pageMocks.readDeployment.mockReset();
    pageMocks.readSession.mockReset().mockResolvedValue(session);
    pageMocks.readPlanTiers.mockReset().mockResolvedValue({
      free: ["gpt-5.6-luna", "claude-sonnet-5"],
      premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.6-build"]
    });
    pageMocks.push.mockReset();
  });

  it("P1 SHIPPED client: Free renders both boxes locked and empty, Tree depth 2", async () => {
    const initial = await renderRealNewDebatePageState();
    openOptions(initial.tree);
    const open = await reRender();
    const fields = steeringFields(open);
    const depth = findElement(open, (e) => (e.props as { id?: string }).id === "treeDepth");
    console.info(`P2_SHIPPED_IDS=${JSON.stringify(fields.map((e) => (e.props as { id?: string }).id))}`);
    console.info(`P2_SHIPPED_DISABLED=${JSON.stringify(fields.map((e) => (e.props as { disabled?: boolean }).disabled))}`);
    console.info(`P2_SHIPPED_VALUES=${JSON.stringify(fields.map((e) => (e.props as { value?: string }).value))}`);
    console.info(`P2_SHIPPED_DEPTH=${JSON.stringify((depth?.props as { value?: number })?.value)}`);
    expect(fields.map((e) => (e.props as { id?: string }).id)).toEqual(["steeringPresets", "steeringAnnotations"]);
    expect(fields.every((e) => (e.props as { disabled?: boolean }).disabled === true)).toBe(true);
    expect(fields.map((e) => (e.props as { value?: string }).value)).toEqual(["", ""]);
    expect((depth?.props as { value?: number })?.value).toBe(2);
  });

  it("P2 LEGACY client without readPlanTiers: both boxes STILL render (V-12 'every client')", async () => {
    pageMocks.contractClientHasPlanTierReader = false;
    const initial = await renderRealNewDebatePageState();
    openOptions(initial.tree);
    const open = await reRender();
    const fields = steeringFields(open);
    const depth = findElement(open, (e) => (e.props as { id?: string }).id === "treeDepth");
    console.info(`P2_LEGACY_IDS=${JSON.stringify(fields.map((e) => (e.props as { id?: string }).id))}`);
    console.info(`P2_LEGACY_DEPTH=${JSON.stringify((depth?.props as { value?: number })?.value)}`);
    expect(fields.map((e) => (e.props as { id?: string }).id)).toEqual(["steeringPresets", "steeringAnnotations"]);
    expect((depth?.props as { value?: number })?.value).toBe(2);
  });

  it("P3 SHIPPED client: Premium enables both boxes and carries the typed text", async () => {
    const initial = await renderRealNewDebatePageState();
    chooseRiskTier(initial.tree, "standard");
    choosePlanTier(initial.tree, "premium");
    openOptions(initial.tree);
    const open = await reRender();
    const fields = steeringFields(open);
    expect(fields).toHaveLength(2);
    console.info(`P2_PREMIUM_DISABLED=${JSON.stringify(fields.map((e) => (e.props as { disabled?: boolean }).disabled))}`);
    expect(fields.every((e) => (e.props as { disabled?: boolean }).disabled !== true)).toBe(true);
    fields.forEach((field, index) => {
      const value = index === 0 ? "Prefer primary sources" : "Flag unsupported claims";
      const node = { value, style: { height: "" }, scrollHeight: 50 };
      (field.props as { onChange?: (event: unknown) => void }).onChange?.({ target: node, currentTarget: node });
    });
    const form = findElement(await reRender(), (e) => e.type === "form");
    expect(form).not.toBeNull();
    await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> })
      .onSubmit({ preventDefault: vi.fn() });
    const config = pageMocks.createDebate.mock.calls.at(-1)![1] as Record<string, unknown>;
    console.info(`P2_PREMIUM_CONFIG=${JSON.stringify({ plan_tier: config.plan_tier, steering_presets: config.steering_presets, steering_annotations: config.steering_annotations, depth: config.depth })}`);
    expect(config).toMatchObject({
      plan_tier: "premium",
      steering_presets: ["Prefer primary sources"],
      steering_annotations: ["Flag unsupported claims"]
    });
  });

  it("P4 SHIPPED client: a Free ask still leaves with both steering lists empty", async () => {
    const initial = await renderRealNewDebatePageState();
    chooseRiskTier(initial.tree, "standard");
    const form = findElement(await reRender(), (e) => e.type === "form");
    expect(form).not.toBeNull();
    await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> })
      .onSubmit({ preventDefault: vi.fn() });
    const config = pageMocks.createDebate.mock.calls.at(-1)![1] as Record<string, unknown>;
    console.info(`P2_FREE_CONFIG=${JSON.stringify({ plan_tier: config.plan_tier, steering_presets: config.steering_presets, steering_annotations: config.steering_annotations })}`);
    expect(config).toMatchObject({ plan_tier: "free", steering_presets: [], steering_annotations: [] });
  });
});
