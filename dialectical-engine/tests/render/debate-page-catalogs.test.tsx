import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DebatePage from "../../apps/ui/app/debate/[id]/page.js";
import { DebateCanvas } from "../../apps/ui/components/DebateCanvas.js";
import { loadNamespace } from "../../apps/ui/lib/i18n/server.js";
import type { DebateNode } from "../../apps/ui/lib/types.js";
import { debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import { LOCALE_COOKIE } from "../../apps/ui/lib/i18n/locales.js";

// FIX-DEBATE-CATALOGS: V saw a Hebrew-interface debate whose Synthesis panel
// read "Synthesis" / "The strongest case on each side, plus a verdict." /
// "Synthesis runs once the tree completes…" in English, because the debate
// page never loaded the locale's debateDrawers catalogue and SynthesisPanel
// fell back to its English default. This mounts the real page (page.tsx →
// DebatePageGate → DebatePageClient → SynthesisPanel) under a locale cookie.

const mocks = vi.hoisted(() => ({
  getDebateServer: vi.fn(),
  locale: "en"
}));

vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  getDebateServer: mocks.getDebateServer
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => React.ReactNode }) => children("t".repeat(43))
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: name === LOCALE_COOKIE ? mocks.locale : "t".repeat(43) })
  }),
  headers: async () => new Headers({ "user-agent": "vitest-render-browser" })
}));

const queuedRun = {
  run_ref: "run:queued",
  question_line: "Messi or Ronaldo?",
  state: "QUEUED" as const,
  terminal_reason: null,
  hold_until: null
};

const SYNTHESIS_KEYS = [
  "debateDrawers.synthesis.title",
  "debateDrawers.synthesis.subtitle",
  "debateDrawers.synthesis.pendingNote"
] as const;

function catalogValue(locale: string, namespace: string, key: string): string {
  const catalog = JSON.parse(
    readFileSync(new URL(`../../apps/ui/messages/${locale}/${namespace}.json`, import.meta.url), "utf8")
  ) as Record<string, string>;
  const value = catalog[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${locale}/${namespace} lacks ${key}`);
  return value;
}

/** A queued debate whose tree carries one lens branch with no backend label, so its
 * role label comes from the debateChrome catalogue (roleLabel → branchLabelOf). */
function debateWithLensBranch() {
  const detail = debateDetailFromRunProjection(queuedRun);
  const root = detail.tree!;
  const lens: DebateNode = {
    id: "node:lens",
    debate_id: root.debate_id,
    parent_id: root.id,
    node_type: "SCIENTIFIC_POV",
    depth: 1,
    position: 0,
    claim: "A lens claim under test",
    status: "active",
    materialized_path: `${root.materialized_path}/node:lens`,
    active_generation_id: null,
    active_generation: null,
    children: []
  };
  return { ...detail, tree: { ...root, children: [lens] } };
}

function synthesisStrings(locale: string): string[] {
  const catalog = JSON.parse(
    readFileSync(new URL(`../../apps/ui/messages/${locale}/debateDrawers.json`, import.meta.url), "utf8")
  ) as Record<string, string>;
  return SYNTHESIS_KEYS.map((key) => {
    const value = catalog[key];
    if (typeof value !== "string" || value.length === 0) throw new Error(`${locale} lacks ${key}`);
    return value;
  });
}

/** The English page as fc3cb865a rendered it (see the byte-identical row). */
function headFixture(name: "queued" | "lens"): string {
  return readFileSync(resolve(process.cwd(), `tests/render/fixtures/debate-page-en.fc3cb865a.${name}.html`), "utf8");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function renderPage(locale: string): Promise<string> {
  mocks.locale = locale;
  const element = await DebatePage({ params: Promise.resolve({ id: queuedRun.run_ref }) });
  return renderToStaticMarkup(element as ReactElement);
}

function synthesisPanel(html: string): string {
  const start = html.indexOf('<aside class="synthPanel');
  expect(start).toBeGreaterThanOrEqual(0);
  return html.slice(start, html.indexOf("</aside>", start));
}

describe("FIX-DEBATE-CATALOGS: the debate page renders its drawers in the interface locale", () => {
  beforeEach(() => {
    mocks.getDebateServer.mockReset();
    mocks.getDebateServer.mockResolvedValue({ ok: false, kind: "loading", run: queuedRun });
  });

  it("renders the Synthesis title, subtitle and pending note from the Hebrew catalogue", async () => {
    const hebrew = synthesisStrings("he");
    const english = synthesisStrings("en");
    const panel = synthesisPanel(await renderPage("he"));
    for (const value of hebrew) expect(panel).toContain(escapeHtml(value));
    // MUT: drop catalog={debateDrawersCatalog} from <SynthesisPanel>, or stop loading debateDrawers in page.tsx -> RED.
    for (const value of english) expect(panel).not.toContain(escapeHtml(value));
  });

  it("leaves the English page byte-identical to the pre-fix render at HEAD fc3cb865a", async () => {
    const english = synthesisStrings("en");
    const html = await renderPage("en");
    const panel = synthesisPanel(html);
    for (const value of english) expect(panel).toContain(escapeHtml(value));
    // Review F7 (REV-FIX-CATALOGS): the reference is NOT the new code. The two
    // fixtures were rendered from `git archive fc3cb865a` (the pre-fix tree) with
    // this file's mocks and the same two debates; the recipe is in the handoff
    // (FIX-DEBATE-CATALOGS.md, Follow-up 4). Regenerate them only from that commit.
    // React's useId values depend on tree depth; they are not copy.
    const reactIds = (markup: string) => markup.replace(/_R_[0-9a-z]+_/g, "_R_id_");
    expect(reactIds(html)).toBe(reactIds(headFixture("queued")));
    mocks.getDebateServer.mockResolvedValue({ ok: true, debate: debateWithLensBranch(), answer: null });
    expect(reactIds(await renderPage("en"))).toBe(reactIds(headFixture("lens")));
  });

  // Follow-up 4, review F1: the workspace's AI notice reads home.* keys, which the
  // debateChrome catalogue it used to receive does not carry, so its link and both
  // aria-labels answered from t()'s English backstop on a Hebrew page.
  it("labels the debate page's AI notice link and region from the Hebrew home catalogue", async () => {
    const html = await renderPage("he");
    const notice = html.slice(html.indexOf('<section class="aiNotice'));
    const close = notice.indexOf("</section>");
    const region = notice.slice(0, close);
    expect(region).toContain(`aria-label="${escapeHtml(catalogValue("he", "home", "home.aiDisclosure"))}"`);
    expect(region).toContain(`aria-label="${escapeHtml(catalogValue("he", "home", "home.aiLinkLabel"))}"`);
    expect(region).toContain(`>${escapeHtml(catalogValue("he", "home", "home.aiLink"))}<`);
    expect(region).toContain(escapeHtml(catalogValue("he", "debateChrome", "debateChrome.aiNotice")));
    // MUT: pass catalog={debateChromeCatalog} to <AiNotice> again (the pre-fix wiring) -> RED.
    for (const key of ["home.aiDisclosure", "home.aiLinkLabel", "home.aiLink"]) {
      expect(region).not.toContain(escapeHtml(catalogValue("en", "home", key)));
    }
  });

  // Follow-up 2 (V: "This needs to be done in all languages"): one level down,
  // the helpers the cards call (roleLabel, scrutinyStatus) take the locale's
  // catalogue too; neither falls back to English on a Hebrew page.
  it("labels a lens branch on the Hebrew page from the Hebrew debateChrome catalogue", async () => {
    mocks.getDebateServer.mockResolvedValue({ ok: true, debate: debateWithLensBranch(), answer: null });
    const hebrewLens = catalogValue("he", "debateChrome", "debateChrome.presentation.lens.scientific");
    const englishLens = catalogValue("en", "debateChrome", "debateChrome.presentation.lens.scientific");
    const html = await renderPage("he");
    const card = html.slice(html.indexOf('data-node-id="node:lens"'));
    expect(card).toContain(`◆ ${escapeHtml(hebrewLens)}`);
    // MUT: drop debateChromeCatalog from the canvas, or call roleLabel(node) bare -> RED.
    expect(card).not.toContain(`◆ ${escapeHtml(englishLens)}`);
    const english = await renderPage("en");
    expect(english.slice(english.indexOf('data-node-id="node:lens"'))).toContain(`◆ ${escapeHtml(englishLens)}`);
  });

  it("shows a card's scrutiny status from the Hebrew compose catalogue", async () => {
    // Scrutiny is client state the challenge flow sets, so this mounts the canvas the
    // page mounts, with the catalogues the page loads for the Hebrew locale.
    const [debateChromeCatalog, composeCatalog] = await Promise.all([
      loadNamespace("he", "debateChrome"),
      loadNamespace("he", "compose")
    ]);
    const detail = debateWithLensBranch();
    const render = (catalogs: { debateChromeCatalog?: Record<string, string>; composeCatalog?: Record<string, string> }) =>
      renderToStaticMarkup(
        <DebateCanvas
          root={detail.tree!}
          expanded={new Set()}
          selectedNodeId={null}
          scrutiny={{ "node:lens": "working" }}
          meta={{ claims: 2, depth: 1, judged: 0, derivedStanding: 0, setAside: 0 }}
          onOpenNode={() => {}}
          onToggleExpand={() => {}}
          {...catalogs}
        />
      );
    const hebrewStatus = catalogValue("he", "compose", "compose.scrutiny.status.investigating");
    const englishStatus = catalogValue("en", "compose", "compose.scrutiny.status.investigating");
    const hebrew = render({ debateChromeCatalog, composeCatalog });
    expect(hebrew).toContain(escapeHtml(hebrewStatus));
    // MUT: restore the module-level SCRUTINY_STATUS (built once, in English) -> RED.
    expect(hebrew).not.toContain(escapeHtml(englishStatus));
    expect(render({})).toContain(escapeHtml(englishStatus));
  });
});
