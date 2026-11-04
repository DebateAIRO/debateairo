import { useEffect, useState } from "react";
import type { ContractClient } from "@debateai/contract";
import { contractClient } from "../api.js";

/*
 * V4 screen review (owner picks 3 Nov 2026), public-f26 and journey-f20: a debate's public state, for the small grey
 * globe line under the breadcrumb ("Public · See its page · Copy link") and the "This will be public." line under the
 * boxes where the person types words that go on its public page.
 *
 * What the server says today: GET /v1/runs/{id}/visibility answers PUBLISHED with the public page's reference, or PRIVATE.
 * PUBLISHED is certain, so "Public" shows from it. PRIVATE cannot tell "will be public when finished" or "being checked"
 * from "kept private because it did not pass the check" or a paid debate that simply is private, so those three stages
 * come only from an OPTIONAL field the server does not send yet (`public_stage`, the track's server note); the
 * contract's read is strict, so they arrive once the contract names it. Until then PRIVATE shows nothing: the page never
 * guesses Free or paid, so a paid person is never told their debate is public. No browser storage.
 */

export type PublicStage =
  | Readonly<{ kind: "WILL_BE_PUBLIC" }>
  | Readonly<{ kind: "BEING_CHECKED" }>
  | Readonly<{ kind: "PUBLIC"; publicRef: string }>
  | Readonly<{ kind: "KEPT_PRIVATE" }>;

/** The visibility read's optional field naming the stages before and after the check (not sent yet). */
export const PUBLIC_STAGE_FIELD = "public_stage";
const PENDING_STAGES = ["WILL_BE_PUBLIC", "BEING_CHECKED", "KEPT_PRIVATE"] as const;
const REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** While the stage may still change by itself (will be public, being checked), how often it is read again. */
export const PUBLIC_STAGE_REREAD_MS = 30_000;

/** The stage a visibility read says, or null: a private debate (or a read that says nothing more). */
export function publicStageOf(read: object): PublicStage | null {
  const loose = read as Readonly<Record<string, unknown>>;
  if (loose.state === "PUBLISHED" && typeof loose.public_ref === "string" && REF.test(loose.public_ref)) {
    return Object.freeze({ kind: "PUBLIC", publicRef: loose.public_ref });
  }
  const stage = loose[PUBLIC_STAGE_FIELD];
  return (PENDING_STAGES as readonly unknown[]).includes(stage) ? Object.freeze({ kind: stage as (typeof PENDING_STAGES)[number] }) : null;
}

/** True while the stage still changes by itself: the page reads it again now and then. */
export function stageMayChange(stage: PublicStage | null): boolean {
  return stage !== null && (stage.kind === "WILL_BE_PUBLIC" || stage.kind === "BEING_CHECKED");
}

/** Whether what the person types into a dig of this debate goes on its public page (journey-f20: "This will be public."). */
export function typedGoesPublic(stage: PublicStage | null): boolean {
  return stage !== null && stage.kind !== "KEPT_PRIVATE";
}

export function publicPageHref(publicRef: string): string {
  return `/public/debate/${encodeURIComponent(publicRef)}`;
}

/** The run's stage; null when private, when it cannot be read, or when the read is not offered (never throws). */
export async function readPublicStage(runId: string, client: Pick<ContractClient, "readRunVisibility"> = contractClient): Promise<PublicStage | null> {
  try {
    return publicStageOf(await Promise.resolve().then(() => client.readRunVisibility(runId)));
  } catch {
    return null;
  }
}

/**
 * The stage of `runId` (null: none to show), read when the debate on screen changes and when `readAgain` changes (the
 * answer settled), then every PUBLIC_STAGE_REREAD_MS while it may still change and the page is visible.
 */
export function usePublicStage(runId: string | null, readAgain: unknown = null, client?: Pick<ContractClient, "readRunVisibility">): PublicStage | null {
  const [state, setState] = useState<Readonly<{ runId: string; stage: PublicStage | null }> | null>(null);
  useEffect(() => {
    if (runId === null) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = (): void => {
      void readPublicStage(runId, client).then((stage) => {
        if (!active) return;
        setState((previous) => (previous !== null && previous.runId === runId && sameStage(previous.stage, stage) ? previous : { runId, stage }));
        if (stageMayChange(stage)) timer = setTimeout(again, PUBLIC_STAGE_REREAD_MS);
      });
    };
    const again = (): void => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        timer = setTimeout(again, PUBLIC_STAGE_REREAD_MS);
        return;
      }
      read();
    };
    read();
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [runId, readAgain, client]);
  return state !== null && runId !== null && state.runId === runId ? state.stage : null;
}

function sameStage(a: PublicStage | null, b: PublicStage | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && (a.kind !== "PUBLIC" || (b.kind === "PUBLIC" && a.publicRef === b.publicRef));
}
