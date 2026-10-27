"use client";

import { t } from "@/lib/i18n/translate";
import { ownWords } from "@/lib/v4/askText";
import type { DigView, V4OpenQuestion, V4Selection } from "@/lib/v4/types";
import {
  digNote,
  digsUnder,
  digTitle,
  NewDot,
  openCount,
  openNote,
  pathTitle,
  PickBox,
  resolveSelection,
  selectionIdOf,
  shortText,
  TitleText,
  undugOpen,
  viaKeyboard,
  type MapPiecesProps
} from "./V4MapTree";
import { V4TrustBar } from "./V4TrustBar";

/*
 * V4 initial (2026-10-28): the phone map (D7) as an indented list: the question, then its own open questions, then
 * each path with its open questions and digs. Every open question has its pick box (the outline doubles as the tray).
 * Tapping a row calls onSelect; the page then shows that question in the panel.
 */

function OpenRow(props: Readonly<{ question: V4OpenQuestion; pieces: MapPiecesProps; selectedId: V4Selection }>) {
  const { question, pieces } = props;
  const id: V4Selection = `open:${question.id}`;
  const picked = pieces.picked.has(question.id);
  const selected = props.selectedId === id;
  return (
    <li className={`v4OutRow v4OutOpen${selected ? " v4OutSelected" : ""}`}>
      <PickBox
        question={question}
        picked={picked}
        onTogglePick={pieces.onTogglePick}
        catalog={pieces.catalog}
        className="v4OutPick"
      />
      <button
        type="button"
        className="v4OutMain"
        aria-current={selected ? "true" : undefined}
        onClick={(event) => pieces.onSelect(id, viaKeyboard(event))}
      >
        <span className="v4OutTitle">
          {question.star ? <span className="v4MapStar" aria-hidden="true">★ </span> : null}
          <span data-ai-generated="true">{shortText(question.text)}</span>
        </span>
        <span className="v4MapNote">
          {question.star ? `${t(pieces.catalog, "v4.map.starHint")} · ` : null}
          {openNote(question, picked, pieces.catalog)}
        </span>
        {selected ? <span className="v4OutHere">{t(pieces.catalog, "v4.outline.here")}</span> : null}
        {pieces.changed.has(id) ? <NewDot catalog={pieces.catalog} /> : null}
      </button>
    </li>
  );
}

function DigRow(props: Readonly<{ dig: DigView; pieces: MapPiecesProps; selectedId: V4Selection }>) {
  const { dig, pieces } = props;
  const id: V4Selection = `dig:${dig.link.childRunId}`;
  const selected = props.selectedId === id;
  const working = dig.state === "WAITING" || dig.state === "RUNNING";
  return (
    <li className={`v4OutRow v4OutDig${selected ? " v4OutSelected" : ""}`}>
      <button
        type="button"
        className="v4OutMain"
        aria-current={selected ? "true" : undefined}
        onClick={(event) => pieces.onSelect(id, viaKeyboard(event))}
      >
        <TitleText className="v4OutTitle" title={digTitle(dig, pieces.catalog)} catalog={pieces.catalog} />
        <span className="v4MapNote">
          {working ? <span className="v4MapPulse" aria-hidden="true" /> : null}
          {digNote(dig, pieces.catalog)}
        </span>
        {dig.state === "DONE" && dig.counts !== null ? <V4TrustBar counts={dig.counts} catalog={pieces.catalog} /> : null}
        {selected ? <span className="v4OutHere">{t(pieces.catalog, "v4.outline.here")}</span> : null}
        {pieces.changed.has(id) ? <NewDot catalog={pieces.catalog} /> : null}
      </button>
    </li>
  );
}

function Children(props: Readonly<{
  open: readonly V4OpenQuestion[];
  digs: readonly DigView[];
  pieces: MapPiecesProps;
  selectedId: V4Selection;
  groupKey: string;
}>) {
  if (props.open.length === 0 && props.digs.length === 0) return null;
  return (
    <ul className="v4OutGroup v4OutLeaves">
      {props.open.map((question) => (
        <OpenRow key={`${props.groupKey}/${question.id}`} question={question} pieces={props.pieces} selectedId={props.selectedId} />
      ))}
      {props.digs.map((dig) => (
        <DigRow key={dig.link.childRunId} dig={dig} pieces={props.pieces} selectedId={props.selectedId} />
      ))}
    </ul>
  );
}

export function V4Outline(props: MapPiecesProps) {
  const { map, digs, catalog } = props;
  const selectedId = selectionIdOf(resolveSelection(map, digs, props.selected));
  const rootSelected = selectedId === "root";
  const waiting = openCount(map, digs);
  return (
    <nav className="v4Out" aria-label={t(catalog, "v4.outline.label")}>
      <ul className="v4OutTree">
        <li className="v4OutRow">
          <button
            type="button"
            className={`v4OutRoot${rootSelected ? " v4OutSelected" : ""}`}
            aria-current={rootSelected ? "true" : undefined}
            onClick={(event) => props.onSelect("root", viaKeyboard(event))}
          >
            <span className="v4OutRootTitle v4Serif" data-ai-generated="true">{shortText(ownWords(map.question), 110)}</span>
            {waiting > 0 ? <span className="v4MapRootChip">{t(catalog, "v4.map.openCount", { count: waiting })}</span> : null}
            {props.changed.has("root") ? <NewDot catalog={catalog} /> : null}
          </button>
          <Children
            groupKey="root"
            open={undugOpen(map.open, digs)}
            digs={digsUnder(map, digs, null)}
            pieces={props}
            selectedId={selectedId}
          />
          {map.paths.length === 0
            ? <p className="v4MapEmpty v4Muted">{t(catalog, "v4.map.noPaths")}</p>
            : (
              <ul className="v4OutGroup">
                {map.paths.map((path) => {
                  const id: V4Selection = `path:${path.id}`;
                  const selected = selectedId === id;
                  return (
                    <li key={path.id} className="v4OutRow">
                      <button
                        type="button"
                        className={`v4OutPath${selected ? " v4OutSelected" : ""}`}
                        aria-current={selected ? "true" : undefined}
                        onClick={(event) => props.onSelect(id, viaKeyboard(event))}
                      >
                        <TitleText className="v4OutTitle" title={pathTitle(path, catalog)} catalog={catalog} />
                        <span className="v4OutMeta">
                          {path.fate !== null
                            ? <span className={`v4MapFate v4MapFate${path.fate}`}>{t(catalog, `v4.fate.${path.fate}`)}</span>
                            : null}
                          {selected ? <span className="v4OutHere">{t(catalog, "v4.outline.here")}</span> : null}
                          {props.changed.has(id) ? <NewDot catalog={catalog} /> : null}
                        </span>
                        <V4TrustBar counts={path.counts} unchecked={path.unchecked} catalog={catalog} />
                      </button>
                      <Children
                        groupKey={path.id}
                        open={undugOpen(path.open, digs)}
                        digs={digsUnder(map, digs, path.id)}
                        pieces={props}
                        selectedId={selectedId}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
        </li>
      </ul>
    </nav>
  );
}
