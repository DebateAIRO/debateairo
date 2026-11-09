"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { StartCard } from "@debateai/contract";
import { t } from "@/lib/i18n/translate";
import type { PathPlan, PathPlanAction, PathPlanRefusal } from "@/lib/v4/pathPlan";
import type { StartFullRequest } from "./V4StartCard";
import type { StartPlanProps } from "./V4StartRow";

/*
 * V4 start step, Task 74 (read-d3, choose-d2, choose-f7; spec 2026-11-03 §2 item 4; row D §4): "Another way to see it", the
 * 2-3 cards between the questions and the paths, each a different way to read the question, picked in the merge (no AI call
 * of its own). A card says what kind of surprise it is and the AI's sentence, then:
 *  - [Add to path N, no extra path] [Add as its own path] when it fits a path on the list, else [+ Look into this];
 *    once on the list, "Added to path N ✓" or "Added as a path ✓" (Undo brings the buttons back). On a full list it is never
 *    a dead end (choose-f7): the card's full-list choice opens under it;
 *  - [Make this my question] when the card has a question of its own: the card's question takes the place of the person's
 *    words in the box, their words are kept as a path, and Undo puts them back; then "Your question is now this one. Your
 *    earlier question is kept as path N."
 * The cards sit side by side and snap as they scroll; on a phone each takes most of the row (the CSS).
 * Every change goes through `dispatch`; nothing here fetches, stores or keeps anything in the browser.
 */

export type V4StartWaysProps = StartPlanProps & Readonly<{
  /**
   * "Make this my question" (the card sends it with the line the check read, and the page then puts the card's question in
   * the box); its refusal, or null. Null: not offered.
   */
  onMakeMyQuestion: ((cardId: string) => PathPlanRefusal | null) | null;
  /** The card's full-list choice; without it a full list's refusal goes to onRefusal. */
  fullChoice?(request: StartFullRequest): ReactNode;
}>;

/**
 * The AI's sentence under its kind: a sentence that starts by naming the kind ("A choice you may not have weighed: keep …")
 * shows without it, as the kind already stands above it ("Keep …").
 */
function startWaySentence(sentence: string, kind: string): string {
  if (sentence.slice(0, kind.length).toLocaleLowerCase() !== kind.toLocaleLowerCase()) return sentence;
  const rest = /^\s*:\s*/u.exec(sentence.slice(kind.length));
  if (rest === null) return sentence;
  const [first = "", ...others] = Array.from(sentence.slice(kind.length + rest[0].length));
  return first === "" ? sentence : `${first.toLocaleUpperCase()}${others.join("")}`;
}

/** Where the card's own viewpoint is on the list: the path holding it and its place; null when it is not on the list. */
function cardOnList(plan: PathPlan, cardId: string): Readonly<{ at: number; alone: boolean }> | null {
  const at = plan.paths.findIndex((path) => path.viewpoints.some((viewpoint) => viewpoint.key === cardId));
  return at < 0 ? null : { at, alone: plan.paths[at]!.viewpoints.length === 1 };
}

/** The place of the path that keeps the person's earlier question after "Make this my question"; null when none does now. */
function keptQuestionAt(plan: PathPlan): number | null {
  const swap = plan.questionSwap;
  if (swap === null) return null;
  const words = swap.original.trim();
  const at = plan.paths.findIndex((path) => path.viewpoints.some((viewpoint) => viewpoint.source.kind === "OWN" && viewpoint.question === words));
  return at < 0 ? null : at;
}

/** "Another way to see it"; null without cards. */
export function V4StartWays(props: V4StartWaysProps) {
  const { plan, catalog, dispatch, onRefusal } = props;
  const titleId = useId();
  /** The card whose full-list choice shows, and the card whose question found no room. */
  const [full, setFull] = useState<string | null>(null);
  const [noRoom, setNoRoom] = useState<string | null>(null);
  const addedLines = useRef(new Map<string, HTMLElement>());
  const focusAdded = useRef<string | null>(null);

  // Once a card is on the list, its pressed button is gone: focus goes to the line that says where it went.
  useEffect(() => {
    const cardId = focusAdded.current;
    if (cardId === null) return;
    focusAdded.current = null;
    addedLines.current.get(cardId)?.focus();
  });

  if (plan.cards.length === 0) return null;

  const use = (card: StartCard, intoPathKey: string | null): void => {
    const action: PathPlanAction = { type: "USE_CARD", cardId: card.card_id, intoPathKey };
    setNoRoom(null);
    const refusal = dispatch(action);
    if (refusal === null) {
      setFull(null);
      focusAdded.current = card.card_id;
    } else if (refusal === "PATHS_FULL" && props.fullChoice !== undefined) {
      setFull(card.card_id);
    } else {
      onRefusal(refusal, action);
    }
  };
  const makeMine = (card: StartCard): void => {
    if (props.onMakeMyQuestion === null) return;
    setFull(null);
    setNoRoom(props.onMakeMyQuestion(card.card_id) === "PATHS_FULL" ? card.card_id : null);
  };
  const listFull = plan.paths.length >= plan.width;
  const keptAt = keptQuestionAt(plan);

  const way = (card: StartCard): ReactNode => {
    const kind = t(catalog, `v4.start.ways.kind.${card.kind}`);
    const listed = cardOnList(plan, card.card_id);
    const fitsAt = card.fits_path_ref === null ? -1 : plan.paths.findIndex((path) => path.key === card.fits_path_ref);
    const swapped = plan.questionSwap?.cardId === card.card_id;
    const offerMine = card.as_question !== null && !swapped && props.onMakeMyQuestion !== null;
    const buttons: ReactNode[] = [];
    if (listed === null && fitsAt >= 0) {
      buttons.push(
        <button key="into" type="button" className="v4Btn" onClick={() => use(card, card.fits_path_ref)}>
          {t(catalog, "v4.start.ways.addTo", { n: fitsAt + 1 })}
        </button>,
        <button key="own" type="button" className="v4Btn" onClick={() => use(card, null)}>{t(catalog, "v4.start.ways.addAsPath")}</button>
      );
    } else if (listed === null) {
      buttons.push(<button key="look" type="button" className="v4Btn" onClick={() => use(card, null)}>{t(catalog, "v4.start.lookInto")}</button>);
    }
    if (offerMine) {
      buttons.push(<button key="mine" type="button" className="v4Btn" onClick={() => makeMine(card)}>{t(catalog, "v4.start.ways.makeMine")}</button>);
    }
    return (
      <li key={card.card_id} className="v4StartWay" data-card-id={card.card_id}>
        <p className="v4StartWayKind">{kind}</p>
        <p className="v4StartWaySentence" dir="auto" data-ai-generated="true">{startWaySentence(card.sentence, kind)}</p>
        {listed === null ? null : (
          <p
            ref={(element) => { if (element === null) addedLines.current.delete(card.card_id); else addedLines.current.set(card.card_id, element); }}
            className="v4StartWayAdded"
            tabIndex={-1}
          >
            {listed.alone ? t(catalog, "v4.start.added.asPath") : t(catalog, "v4.start.added.to", { n: listed.at + 1 })}
          </p>
        )}
        {swapped ? (
          <p className="v4StartWaySwapped">
            {keptAt === null ? t(catalog, "v4.start.ways.swappedNow") : t(catalog, "v4.start.ways.swapped", { n: keptAt + 1 })}
          </p>
        ) : null}
        {buttons.length === 0 ? null : <div className="v4StartWayActions">{buttons}</div>}
        {noRoom === card.card_id && !swapped ? <p className="v4StartWayNoRoom" role="status">{t(catalog, "v4.start.ways.noRoom")}</p> : null}
        {full === card.card_id && listed === null && listFull && props.fullChoice !== undefined ? props.fullChoice({
          make: (target) => ({ type: "USE_CARD", cardId: card.card_id, ...target }),
          listed: (after) => cardOnList(after, card.card_id) !== null,
          onDone: () => {
            setFull(null);
            focusAdded.current = card.card_id;
          },
          onCancel: () => setFull(null)
        }) : null}
      </li>
    );
  };

  return (
    <section className="v4StartWaysBlock" aria-labelledby={titleId}>
      <h3 id={titleId} className="v4StartWaysTitle">{t(catalog, "v4.start.ways.title")}</h3>
      <ul className="v4StartWays">{plan.cards.map(way)}</ul>
    </section>
  );
}
