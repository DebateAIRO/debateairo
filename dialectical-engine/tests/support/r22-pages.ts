// What R22's V4 pages send, shared by the test files that drive tests/support/r22-world.ts: the ask page's submit
// (createDebate over v4AskConfig), the message catalogs, the two plan settings and a judge panel that agrees. Moved here
// from tests/integration/r22-end-to-end.test.ts (upload check Task 8) so tests/integration/r22-public-report.test.ts
// reuses it instead of copying it. All data is made up.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AskParent, PublicDigParent, PurposeLines } from "@debateai/contract";
import { COOKIE_SESSION_MARKER, createDebate } from "../../apps/ui/lib/api.js";
import type { R22Account, R22Script } from "./r22-world.js";

// This one uses the website's own "@/" paths and modules, which only the website's typecheck resolves (as
// apps/ui/lib/v4/load.ts says of lib/v3): loaded by name, typed here. Vitest resolves it as the page does.
export type V4AskSettings = Readonly<{ planTier: "free" | "premium"; shapeSettings: boolean; lengthSettings: boolean; settingsVersion?: number }>;
const websiteModule = async <T>(path: string): Promise<T> => import(/* @vite-ignore */ new URL(path, import.meta.url).href) as Promise<T>;
const { v4AskConfig } = await websiteModule<{ v4AskConfig: (mode: "quick" | "thorough", level: "plain", settings: V4AskSettings, at: Date, catalog: Record<string, string>) => Record<string, unknown> }>("../../apps/ui/lib/v4/askConfig.ts");

const messages = resolve(import.meta.dirname, "../../apps/ui/messages/en");
export const catalogOf = (...names: readonly string[]) => Object.assign({}, ...names.map((name) => JSON.parse(readFileSync(resolve(messages, `${name}.json`), "utf8")) as object)) as Record<string, string>;
export const newDebateCatalog = catalogOf("newDebate", "compose");
export const v4Catalog = catalogOf("v4");

export const PREMIUM: V4AskSettings = { planTier: "premium", shapeSettings: false, lengthSettings: false };
export const FREE: V4AskSettings = { planTier: "free", shapeSettings: false, lengthSettings: false };

/** What the V4 ask page sends for a question (useV4Ask's submit, without its dialogs). */
export async function ask(who: R22Account, question: string, options: Readonly<{ settings?: V4AskSettings; mode?: "quick" | "thorough"; parent?: AskParent; purposeLines?: PurposeLines;
  publicLane?: Readonly<{ publicParent?: PublicDigParent; freePublicNotice?: true }> }> = {}) {
  const config = v4AskConfig(options.mode ?? "quick", "plain", options.settings ?? PREMIUM, new Date(), newDebateCatalog);
  return createDebate(question, config, COOKIE_SESSION_MARKER, who.client, undefined, options.parent, options.purposeLines, options.publicLane);
}

/** A panel that agrees with the writers, so no scripted point falls under the site's hidden-score line (the stand-in's own panel scores 0). */
export const panelAgrees: R22Script = (_contract, request) => request.kind !== "PANEL" ? null : { content: JSON.stringify({ steelman: { summary: "A fair reading of the point.", fidelity: 0.72 },
  critic: { summary: "A plain objection to the point.", counterargumentStrength: 0.28, basis: "PLAUSIBLE_COUNTER" }, evidence: { quality: 0.72, relevance: 0.72 }, context: { fit: 0.72, ambiguityFlags: [] }, fallacy: { severity: 0.28, fatalFlags: [] } }) };
