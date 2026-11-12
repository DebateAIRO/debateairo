"use client";

import type { ReactNode } from "react";
import { V4MapTree } from "@/components/v4/V4MapTree";
import type { MessageCatalog } from "@/lib/i18n/translate";
import type { DigView, V4Map } from "@/lib/v4/types";

/*
 * V4 start step, Tasks 76b and 76i (owner answer Q11; wait-f14): the map before the debate's first run read, drawn by both
 * pages: the ask page during Start's Undo window and its send, and the map page while it checks the session and reads the debate
 * for the first time (lib/v4/startHandOff.ts). Task 61's tree pieces, read-only (no pick boxes), the question's card selected,
 * nothing pulsing, no panel and nothing to dig; what the page says under the question comes in `rootExtra`. The paths keep the
 * ids b1..bn of buildV4PendingMap, so the run map that follows draws each card where it was.
 */

const NO_DIGS: readonly DigView[] = Object.freeze([]);
const NOTHING: ReadonlySet<string> = new Set();
const ignore = (): void => undefined;

export function V4PendingMap(props: Readonly<{ map: V4Map; rootExtra: ReactNode; catalog: MessageCatalog; locale: string }>) {
  return (
    <V4MapTree
      map={props.map}
      digs={NO_DIGS}
      selected="root"
      changed={NOTHING}
      picked={NOTHING}
      onSelect={ignore}
      onTogglePick={ignore}
      catalog={props.catalog}
      locale={props.locale}
      readOnly
      running={false}
      rootExtra={props.rootExtra}
    />
  );
}
