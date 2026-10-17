// packages/contract/src/verdict-state.ts
import { z } from "zod";

/**
 * THE VERDICT STATE (GLOSSARY canonical verdict model, DR-066(3); grown by owner ruling E8, 2026-10-15). Closed at four:
 * SUPPORTED ("Clear answer"), CONTESTED ("Close call"), UNSUPPORTED ("Best guess, weak evidence"), SPLIT ("Contested":
 * the comparing judges found no majority; engine 2 only). A closed public vocabulary only grows (04-api-contract.md
 * §14.2): every stored value keeps parsing.
 *
 * Its own module, imported by index.ts, disclosure.ts and story.ts alike: disclosure.ts and story.ts never import
 * index.ts (index.ts imports them, so the reverse import would be an ES-module cycle whose top-level schema reads hit
 * the temporal dead zone; lineage.ts exists for the same reason). index.ts re-exports it.
 */
export const VERDICT_STATES = Object.freeze(["SUPPORTED", "CONTESTED", "UNSUPPORTED", "SPLIT"] as const);
export const VerdictStateSchema = z.enum(VERDICT_STATES);
export type VerdictState = z.infer<typeof VerdictStateSchema>;
