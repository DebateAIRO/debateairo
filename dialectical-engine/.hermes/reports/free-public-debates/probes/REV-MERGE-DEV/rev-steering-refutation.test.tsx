/* REV-MERGE-DEV promoted probe — the /new steering refutation.
   HEAD IT WAS WRITTEN AGAINST: df06aedf (merge of 64d052b4 + cbf1b281).
   HOW TO RUN, from any worktree root R:
     cp this file to R/tests/render/zz-revmergedev-steering.test.tsx
     (cd R && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec vitest run tests/render/zz-revmergedev-steering.test.tsx)
     then DELETE the copy — it captures no state and restores nothing.
   IT IS A REFUTATION: both cases are EXPECTED TO FAIL at df06aedf. R1 failing means
   the steering controls dev's S1-2 ruling removed are rendered; R2 failing means the
   asker's typed text reaches steering_presets / steering_annotations on the wire.
   The ONLY difference from tests/render/ux01-new-debate-form.test.tsx is that the
   mocked contractClient carries readPlanTiers, as the shipped apps/ui/lib/api.ts does;
   apps/ui/app/new/page.tsx:81 branches on exactly that. */
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
  readPlanTiers: vi.fn(),
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
  contractClient: { readDeployment: pageMocks.readDeployment, readSession: pageMocks.readSession, readPlanTiers: pageMocks.readPlanTiers },
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


/* REV-MERGE-DEV refutation fixture — temporary, deleted before handoff.
   Identical harness to ux01-new-debate-form.test.tsx except for ONE thing: the
   mocked contractClient carries readPlanTiers, as the shipped apps/ui/lib/api.ts
   client does. apps/ui/app/new/page.tsx:81 branches on exactly that. */
describe("REV-MERGE-DEV · the /new steering control under the SHIPPED contract client", () => {
  beforeEach(() => {
    hooks.reset();
    pageMocks.authToken = "token:test-user-alpha";
    pageMocks.createDebate.mockReset().mockResolvedValue({ id: "run:new" });
    pageMocks.readDeployment.mockReset();
    pageMocks.readSession.mockReset().mockResolvedValue(session);
    pageMocks.readPlanTiers.mockReset().mockResolvedValue({
      free: ["gpt-5.6-luna", "claude-sonnet-5"],
      premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.6-build"]
    });
    pageMocks.push.mockReset();
  });

  it("R1 renders the two steering controls dev's S1-2 ruling removed", async () => {
    const initial = await renderRealNewDebatePageState();
    openOptionsPanel(initial.tree);
    hooks.beginRender();
    const { default: NewDebatePage } = await import("../../apps/ui/app/new/page.js");
    const open = evaluateElementTree(<NewDebatePage />);
    const steering = collectElements(open, (element) =>
      /steer/i.test(String((element.props as { id?: string }).id ?? "")));
    console.info(`REV_STEERING_CONTROL_IDS=${JSON.stringify(steering.map((e) => (e.props as { id?: string }).id))}`);
    expect(steering.map((e) => (e.props as { id?: string }).id)).toEqual([]);
  });

  it("R2 sends the asker's typed steering text to the ask (PREMIUM tier, controls enabled)", async () => {
    const initial = await renderRealNewDebatePageState();
    chooseRiskTier(initial.tree, "standard");
    const premium = findElement(initial.tree, (element) =>
      (element.props as Record<string, unknown>)["data-field"] === "planTier"
      && String((element.props as Record<string, unknown>)["data-value"] ?? "") === "premium");
    expect(premium, "premium plan-tier control missing").not.toBeNull();
    (premium!.props as { onClick: () => void }).onClick();
    openOptionsPanel(initial.tree);
    hooks.beginRender();
    const { default: NewDebatePage } = await import("../../apps/ui/app/new/page.js");
    const openTree = evaluateElementTree(<NewDebatePage />);
    const enabledSteering = collectElements(openTree, (element) =>
      /steer/i.test(String((element.props as { id?: string }).id ?? ""))
      && element.type === "textarea"
      && (element.props as { disabled?: boolean }).disabled !== true);
    console.info(`REV_ENABLED_STEERING_TEXTAREAS=${enabledSteering.length}`);
    const typed = typeIntoEveryTextControl(openTree, "open");
    hooks.beginRender();
    const form = findElement(evaluateElementTree(<NewDebatePage />), (element) => element.type === "form");
    await (form!.props as { onSubmit: (event: { preventDefault: () => void }) => Promise<void> })
      .onSubmit({ preventDefault: vi.fn() });
    const config = pageMocks.createDebate.mock.calls.at(-1)![1] as Record<string, unknown>;
    console.info(`REV_TYPED=${JSON.stringify(typed)}`);
    console.info(`REV_STEERING_PRESETS=${JSON.stringify(config.steering_presets)}`);
    console.info(`REV_STEERING_ANNOTATIONS=${JSON.stringify(config.steering_annotations)}`);
    console.info(`REV_DEPTH=${JSON.stringify(config.depth)}`);
    expect(config).toMatchObject({ steering_presets: [], steering_annotations: [] });
  });
});
