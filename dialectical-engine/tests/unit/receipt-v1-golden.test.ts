/**
 * V4 start step, Task 8 Step 1: every v1 receipt the release mints today, pinned byte for byte BEFORE receipt v2 exists,
 * so nothing added for v2 can move an R22 debate's shape or web receipt. Every plan x makers {2, 4, 5} x depth {1, 2}
 * x backup {0, 1}, at the standard settings, with a START web part (5 paths, Quick) on the paid plans, plus two v1 web
 * receipts (a debate's start and a dig).
 *
 * Task 91k (owner 9 Nov, "Reserve 9 calls per path"): the web part now mints receipt version 3 with two more reader-1
 * calls per pack. The fixture is frozen as it was (no writer any more): its entries are the receipts of debates already
 * started, and each still parses, its web part reading back at 7 reader-1 calls a pack. Today's mint is pinned against it:
 * the same bytes except the web member, its added attempts and the ceiling, which rise by exactly 2 calls a pack.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { debateShapeSettingsOf } from "@debateai/contract";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import {
  DEBATE_SHAPE_PLAN_KEYS, computeStructuralCeilingBasis, debateShapePolicyStartValues, normaliseDepthParamsForShape,
  resolveDebateShape, webReceipt, webReceiptAnySchema, webSitesOf, webSitesOfReceipt
} from "@debateai/register";

const FIXTURE = new URL("../fixtures/receipts/v1-receipts.json", import.meta.url);
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const POLICY = debateShapePolicyStartValues();
const ASKED = Object.freeze({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const);
const START_WEB = webSitesOf({ kind: "START", depth: "QUICK", paths: 5 });
const DIG_WEB = webSitesOf({ kind: "DIG", depth: "THOROUGH", digPicks: 3 });

function minted(): Readonly<Record<string, unknown>> {
  const receipts: Record<string, unknown> = {};
  for (const plan of DEBATE_SHAPE_PLAN_KEYS) {
    for (const makers of [2, 4, 5]) {
      for (const depth of [1, 2]) {
        for (const backup of [0, 1] as const) {
          const depthParams = normaliseDepthParamsForShape({ depth, ...ASKED }, POLICY, plan);
          const shape = resolveDebateShape({ policy: POLICY, plan, makers, settings: debateShapeSettingsOf(depthParams) });
          receipts[`${plan}/makers-${makers}/depth-${depth}/backup-${backup}`] = computeStructuralCeilingBasis({
            ...TERMS, panelSize: makers, depth, backupSequencesProvisioned: backup,
            ...(shape === null ? {} : { shape }), ...(plan === "free" ? {} : { web: START_WEB })
          });
        }
      }
    }
  }
  receipts["web/start-quick-5"] = webReceipt(START_WEB, 3);
  receipts["web/dig-thorough-3"] = webReceipt(DIG_WEB, 3);
  return receipts;
}

type Basis = Record<string, unknown> & { max_model_attempts?: number; web?: Record<string, unknown> & { sites: Record<string, unknown> } };
const pinned = (): Readonly<Record<string, Basis>> => JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, Basis>;
/** A receipt without its web member, added attempts and ceiling: the bytes Task 91k must not move. */
const withoutWeb = (entry: Basis): string =>
  JSON.stringify(Object.fromEntries(Object.entries(entry).filter(([name]) => name !== "web" && name !== "max_model_attempts")));

describe("the v1 receipts stay byte for byte", () => {
  it("every pinned receipt still parses, its web part read back at 7 reader-1 calls a pack (a started debate keeps its reserve)", () => {
    const old = pinned();
    expect(Object.keys(old)).toEqual(Object.keys(minted()));
    for (const [key, entry] of Object.entries(old)) {
      if (key.startsWith("web/")) {
        const parsed = webReceiptAnySchema.safeParse(entry);
        expect(parsed.success, key).toBe(true);
        expect(webSitesOfReceipt(parsed.data!).readerOneCallsPerPack, key).toBe(7);
        continue;
      }
      const basis = parseCostEnvelopeBasis(entry);
      if (key.startsWith("free/")) expect(basis.web, key).toBeUndefined();
      else expect(basis.web, key).toMatchObject({ readerOneBatchesPerPack: 7, readerOneResendCallsPerPack: 0, readerOneCallsPerPack: 7, readerOneCalls: 35 });
    }
  });

  it("today's mint moves only the web member and the ceiling, by exactly 2 reader-1 calls a pack at the panel member's attempts", () => {
    const old = pinned();
    const now = minted() as Readonly<Record<string, Basis>>;
    for (const [key, entry] of Object.entries(old)) {
      const today = now[key]!;
      if (key.startsWith("web/")) {
        const sites = key === "web/start-quick-5" ? START_WEB : DIG_WEB;
        const member = entry as unknown as Readonly<{ sites: Readonly<Record<string, number>> }>;
        expect(today, key).toMatchObject({ ...entry, version: 3, reader_one_resend_per_pack: 2, sites: { ...member.sites,
          reader_one: member.sites.reader_one! + 2 * sites.packs,
          added_model_attempts: member.sites.added_model_attempts! + 2 * sites.packs * 3 } });
        continue;
      }
      expect(withoutWeb(today), key).toBe(withoutWeb(entry));
      if (key.startsWith("free/")) { expect(today, key).toEqual(entry); continue; }
      const attempts = (entry.per_site_attempts as Record<string, number>).panel_member!;
      const rise = 2 * START_WEB.packs * attempts;
      expect(today.max_model_attempts, key).toBe(entry.max_model_attempts! + rise);
      expect(today.web, key).toEqual({ ...entry.web, version: 3, reader_one_resend_per_pack: 2,
        sites: { ...entry.web!.sites, reader_one: 45, added_model_attempts: (entry.web!.sites.added_model_attempts as number) + rise } });
      // The member's own key order: version 3 names its re-sends after the top count.
      expect(Object.keys(today.web!)).toEqual([...Object.keys(entry.web!).slice(0, -1), "reader_one_resend_per_pack", "sites"]);
    }
  });
});
