"use client";

import { useEffect, useRef, type CSSProperties, type MouseEvent } from "react";
import type { ContractNode } from "@/lib/v3/adapter";
import type { DebateNode } from "@/lib/types";
import { ROLE_PALETTES, renderStateOf, roleLabel, roleOf } from "@/lib/debatePresentation";
import { findNodePathById, partitionArgumentChildren, perspectiveChildren } from "@/lib/debateTreeUtils";
import { ReferenceAuthorPill, ReferenceReviewLine, ReferenceScoreBadges } from "@/components/ReferenceNodeMeta";
import { scrutinyStatus as scrutinyStatuses } from "@/lib/scrutiny";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import miscEnglish from "@/messages/en/misc.json";
import debateChromeEnglish from "@/messages/en/debateChrome.json";
import composeEnglish from "@/messages/en/compose.json";
import { useDebateTextLang } from "@/components/debateTextLang";

function localizedRoleLabel(node: DebateNode, catalog: MessageCatalog, debateChromeCatalog: MessageCatalog): string {
  const role = roleOf(node);
  if (role === "root") return t(catalog, "debateViews.rootClaim");
  if (role === "pro") return t(catalog, "debateViews.pro");
  if (role === "con") return t(catalog, "debateViews.con");
  return roleLabel(node, debateChromeCatalog);
}

export type SplitCallbacks = {
  onFocus: (nodeId: string) => void;
  onOpenNode: (nodeId: string) => void;
  onChallengeNode?: (node: DebateNode, anchor: HTMLElement) => void;
  onToggleExpand: (nodeId: string) => void;
  onProseSelect?: (node: DebateNode, event: MouseEvent) => void;
};

type DebateSplitProps = SplitCallbacks & {
  root: DebateNode;
  focusNodeId: string | null;
  expanded: Set<string>;
  scrutiny?: Record<string, string>;
  v3NodesById?: ReadonlyMap<string, ContractNode>;
  /** The interface locale's `misc` catalogue, for the model identity lines. */
  miscCatalog?: MessageCatalog;
  /** The interface locale's `debateChrome` catalogue: branch role labels. */
  debateChromeCatalog?: MessageCatalog;
  /** The interface locale's `compose` catalogue: scrutiny status, V3 score copy, model family. */
  composeCatalog?: MessageCatalog;
};

/**
 * A claim as Split shows it: its text, or "Loading…" while a live run has not delivered that
 * text yet, so no chip, heading or button is left without a name. Only the claim itself takes
 * the debate's language (`node.claim ? textLang : {}` at each use).
 */
function shownClaim(node: DebateNode, debateChromeCatalog: MessageCatalog): string {
  return node.claim || (renderStateOf(node) === "pending" ? t(debateChromeCatalog, "debateChrome.loading") : "");
}

function subtreeLean(node: DebateNode): { pro: number; con: number } {
  let pro = 0;
  let con = 0;
  const walk = (n: DebateNode) => {
    (n.children || []).forEach((child) => {
      const role = roleOf(child);
      if (renderStateOf(child) !== "empty") {
        if (role === "pro") pro += 1;
        else if (role === "con") con += 1;
      }
      walk(child);
    });
  };
  walk(node);
  return { pro, con };
}

export function DebateSplit({
  root,
  focusNodeId,
  expanded,
  scrutiny = {},
  v3NodesById,
  onFocus,
  onOpenNode,
  onChallengeNode,
  onToggleExpand,
  onProseSelect,
  miscCatalog = miscEnglish,
  debateChromeCatalog = debateChromeEnglish,
  composeCatalog = composeEnglish
}: DebateSplitProps) {
  const { catalog, locale } = useChromeI18n();
  const textLang = useDebateTextLang();
  const path = focusNodeId ? findNodePathById(root, focusNodeId) : [root];
  const focus = path.length ? path[path.length - 1] : root;
  const isRootFocus = focus.node_type === "ROOT_CLAIM";
  // Focus, a chip or a rebuttal unmounts the button that was pressed. When the reader picks a
  // claim here, keyboard focus moves to its heading, so they land on what they chose instead of
  // the top of the page. Any other change of the shown claim moves focus only when it was already
  // lost to the page: opening Split from a Map segment (which unmounts with the Map) does, and
  // opening it from the view switcher does not. Nor does a live run settling, which renames the
  // root from the run ref to the answer id under a reader who may be typing elsewhere.
  const focusHeadingRef = useRef<HTMLDivElement | null>(null);
  const shownFocusId = useRef<string | null>(null);
  const pickedFocusId = useRef<string | null>(null);
  const pick = (nodeId: string) => {
    pickedFocusId.current = nodeId;
    onFocus(nodeId);
  };
  useEffect(() => {
    if (shownFocusId.current === focus.id) return;
    shownFocusId.current = focus.id;
    const picked = pickedFocusId.current === focus.id;
    pickedFocusId.current = null;
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (picked || lost) focusHeadingRef.current?.focus();
  }, [focus.id]);
  const ancestors = path.slice(0, -1);

  const { proChildren, conChildren } = partitionArgumentChildren(focus);
  const perspectives = perspectiveChildren(focus);
  const { pro, con } = subtreeLean(focus);
  const total = pro + con;
  const leanPct = total ? Math.round((pro / total) * 100) : 50;
  const leanLabel = leanPct >= 55
    ? t(catalog, "debateViews.pro")
    : leanPct <= 45
      ? t(catalog, "debateViews.con")
      : t(catalog, "debateViews.even");

  const focusRole = roleOf(focus);
  const focusPal = focusRole === "root" ? null : ROLE_PALETTES[focusRole];

  return (
    <div className="split scroll">
      <div className="splitInner">
        <div className="splitPath">
          <div className="splitPathHead">
            <span>{t(catalog, "debateViews.pathFromRoot")}</span>
            <div className="splitPathChips">
            {(ancestors.length > 0 ? path.slice(0, -1) : [root]).map((node, index) => {
              const role = roleOf(node);
              const pal = role === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[role];
              return (
                <div key={node.id} className="splitChip">
                  <button
                    type="button"
                    className="splitChipBtn"
                    style={{ borderLeftColor: pal.line }}
                    onClick={() => pick(node.id)}
                  >
                    <span
                      className="splitChipRole"
                      style={{ color: pal.text, background: pal.bg, borderColor: pal.border }}
                    >
                      <span aria-hidden="true">{role === "root" ? "●" : pal.arrow}</span>{" "}
                      {role === "root" ? t(catalog, "debateViews.root") : localizedRoleLabel(node, catalog, debateChromeCatalog)}
                    </span>
                    <span className="splitChipClaim" {...(node.claim ? textLang : {})} data-ai-generated={node.node_type === "ROOT_CLAIM" ? undefined : "true"}>{shownClaim(node, debateChromeCatalog)}</span>
                  </button>
                </div>
              );
            })}
            </div>
            <span className="splitPathHint">{t(catalog, "debateViews.clickLevelToStepBack")}</span>
          </div>
        </div>

        {isRootFocus ? (
          <div className="splitFocusShell">
            <div className="splitFocusRoot">
              <span className="referenceStanceTab root" aria-hidden />
              <div className="nodeEyebrow">{t(catalog, "debateViews.rootClaim")}</div>
              <div className="splitFocusRootClaim" role="heading" aria-level={2} tabIndex={-1} ref={focusHeadingRef} {...textLang}>{root.claim}</div>
            </div>
          </div>
        ) : (
          <div className="splitFocusShell" data-reference-split-focus>
            <div className="splitFocusMain" data-ai-generated="true" style={{ borderColor: "var(--line)" }}>
            <span className="referenceStanceTab" style={{ background: focusPal?.line }} aria-hidden />
            <div className="splitFocusHead referenceMetaRow">
              <span
                className="roleBadge"
                style={{ color: focusPal?.text, background: focusPal?.bg, borderColor: focusPal?.border }}
              >
                <span aria-hidden="true">{focusPal?.arrow}</span> {localizedRoleLabel(focus, catalog, debateChromeCatalog)}
              </span>
              <ReferenceScoreBadges node={focus} v3Node={v3NodesById?.get(focus.id)} onOpenNode={onOpenNode} composeCatalog={composeCatalog} />
              <span style={{ flex: 1 }} />
              <ReferenceAuthorPill node={focus} miscCatalog={miscCatalog} composeCatalog={composeCatalog} />
            </div>
            <ReferenceReviewLine review={v3NodesById?.get(focus.id)?.review} miscCatalog={miscCatalog} composeCatalog={composeCatalog} />
            {/* One name for the whole heading: VoiceOver reads a heading split into a hidden
                prefix and visible text as two runs with a stray "level" between them. */}
            <div
              className="splitFocusClaim"
              role="heading"
              {...(focus.claim ? textLang : {})}
              aria-level={2}
              tabIndex={-1}
              ref={focusHeadingRef}
              aria-label={`${localizedRoleLabel(focus, catalog, debateChromeCatalog)}: ${shownClaim(focus, debateChromeCatalog)}`}
            >
              {shownClaim(focus, debateChromeCatalog)}
            </div>
            {focus.active_generation?.argument ? (
              <div className="splitFocusBody" {...textLang} data-challenge-prose={focus.id} onMouseUp={(event) => onProseSelect?.(focus, event)}>
                {focus.active_generation.argument}
              </div>
            ) : null}
            <div className="nodeControls">
              {onChallengeNode ? (
                <button
                  type="button"
                  className="nodeCtrl challenge"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChallengeNode(focus, event.currentTarget);
                  }}
                >
                  <span aria-hidden="true">⚐</span> {t(catalog, "debateViews.challenge")}
                </button>
              ) : null}
              <button type="button" className="nodeCtrl" disabled aria-disabled="true">
                <span aria-hidden="true">↻</span> {t(catalog, "debateViews.regenerate")}
              </button>
              <span style={{ flex: 1 }} />
              <button type="button" className="nodeCtrl link" onClick={() => onOpenNode(focus.id)}>
                {t(catalog, "debateViews.openFullAnalysis")} <span aria-hidden="true">▸</span>
              </button>
            </div>
            </div>
          </div>
        )}

        {total > 0 ? (
          <>
            <div className="splitMeter">
              {/* Label and count are two blocks VoiceOver would run together ("THE CASE FOR8
                  arguments"), so a screen reader gets them as one sentence instead. */}
              <div className="splitMeterSide right">
                <div className="splitMeterLabel pro" aria-hidden="true">↑ {t(catalog, "debateViews.caseFor")}</div>
                <div className="splitMeterCount" aria-hidden="true">{tPlural(catalog, "debateViews.argumentCount", pro, locale)}</div>
                <span className="srOnly">{`${t(catalog, "debateViews.caseFor")}: ${tPlural(catalog, "debateViews.argumentCount", pro, locale)}`}</span>
              </div>
              <div
                className="splitMeterBar"
                style={{
                  background: `linear-gradient(90deg, var(--pro-line) 0%, var(--pro-line) ${leanPct}%, var(--con-line) ${leanPct}%, var(--con-line) 100%)`
                }}
              />
              <div className="splitMeterSide left">
                <div className="splitMeterLabel con" aria-hidden="true">{t(catalog, "debateViews.caseAgainst")} ↓</div>
                <div className="splitMeterCount" aria-hidden="true">{tPlural(catalog, "debateViews.argumentCount", con, locale)}</div>
                <span className="srOnly">{`${t(catalog, "debateViews.caseAgainst")}: ${tPlural(catalog, "debateViews.argumentCount", con, locale)}`}</span>
              </div>
            </div>
            <div className="splitMeterNote">{t(catalog, "debateViews.leanAndFocusHint", { lean: leanLabel })}</div>
          </>
        ) : null}

        {perspectives.length > 0 ? (
          <div className="splitPerspectives">
            {perspectives.map((node) => (
              <PerspectiveCard key={node.id} node={node} onFocus={pick} debateChromeCatalog={debateChromeCatalog} />
            ))}
          </div>
        ) : null}

        {proChildren.length > 0 || conChildren.length > 0 ? (
          <div className="splitColumns">
            <span className="splitBattleLine" aria-hidden />
            <div className="splitColumn pro">
              <div className="splitColumnHead pro">
                <span className="splitColumnIcon pro" aria-hidden="true">↑</span>
                <span>{t(catalog, "debateViews.caseFor")}</span>
              </div>
              {proChildren.length > 0 ? (
                proChildren.map((node) => (
                  <SplitCard
                    key={node.id}
                    node={node}
                    expanded={expanded.has(node.id)}
                    scrutinyStatus={scrutiny[node.id]}
                    v3Node={v3NodesById?.get(node.id)}
                    onOpenNode={onOpenNode}
                    onFocus={pick}
                    onChallengeNode={onChallengeNode}
                    onToggleExpand={onToggleExpand}
                    onProseSelect={onProseSelect}
                    miscCatalog={miscCatalog}
                    debateChromeCatalog={debateChromeCatalog}
                    composeCatalog={composeCatalog}
                  />
                ))
              ) : (
                <p className="splitColumnEmpty">{t(catalog, "debateViews.noSupportingArguments")}</p>
              )}
            </div>
            <div className="splitColumn con">
              <div className="splitColumnHead con">
                <span className="splitColumnIcon con" aria-hidden="true">↓</span>
                <span>{t(catalog, "debateViews.caseAgainst")}</span>
              </div>
              {conChildren.length > 0 ? (
                conChildren.map((node) => (
                  <SplitCard
                    key={node.id}
                    node={node}
                    expanded={expanded.has(node.id)}
                    scrutinyStatus={scrutiny[node.id]}
                    v3Node={v3NodesById?.get(node.id)}
                    onOpenNode={onOpenNode}
                    onFocus={pick}
                    onChallengeNode={onChallengeNode}
                    onToggleExpand={onToggleExpand}
                    onProseSelect={onProseSelect}
                    miscCatalog={miscCatalog}
                    debateChromeCatalog={debateChromeCatalog}
                    composeCatalog={composeCatalog}
                  />
                ))
              ) : (
                <p className="splitColumnEmpty">{t(catalog, "debateViews.noOpposingArguments")}</p>
              )}
            </div>
          </div>
        ) : perspectives.length === 0 ? (
          <div className="splitLeaf">
            {onChallengeNode
              ? t(catalog, "debateViews.leafWithChallenge")
              : t(catalog, "debateViews.leafWithoutChallenge")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PerspectiveCard({
  node,
  onFocus,
  debateChromeCatalog
}: {
  node: DebateNode;
  onFocus: (id: string) => void;
  debateChromeCatalog: MessageCatalog;
}) {
  const { catalog } = useChromeI18n();
  const textLang = useDebateTextLang();
  const { pro, con } = subtreeLean(node);
  return (
    <button type="button" className="splitPerspective" onClick={() => onFocus(node.id)}>
      <span className="splitPerspectiveBadge"><span aria-hidden="true">◆</span> {localizedRoleLabel(node, catalog, debateChromeCatalog)}</span>
      <span className="splitPerspectiveClaim" {...(node.claim ? textLang : {})} data-ai-generated={node.node_type === "ROOT_CLAIM" ? undefined : "true"}>{shownClaim(node, debateChromeCatalog)}</span>
      <span className="splitPerspectiveMeta">
        {t(catalog, "debateViews.perspectiveBalance", { pro, con })} <span aria-hidden="true">▸</span>
      </span>
    </button>
  );
}

type SplitCardProps = {
  node: DebateNode;
  expanded: boolean;
  scrutinyStatus?: string;
  v3Node?: ContractNode;
  onFocus: (id: string) => void;
  onOpenNode: (id: string) => void;
  onChallengeNode?: (node: DebateNode, anchor: HTMLElement) => void;
  onToggleExpand: (id: string) => void;
  onProseSelect?: (node: DebateNode, event: MouseEvent) => void;
  miscCatalog: MessageCatalog;
  debateChromeCatalog: MessageCatalog;
  composeCatalog: MessageCatalog;
};

function SplitCard({
  node,
  expanded,
  scrutinyStatus,
  v3Node,
  onFocus,
  onOpenNode,
  onChallengeNode,
  onToggleExpand,
  onProseSelect,
  miscCatalog,
  debateChromeCatalog,
  composeCatalog
}: SplitCardProps) {
  const { catalog } = useChromeI18n();
  const textLang = useDebateTextLang();
  const role = roleOf(node);
  const pal = role === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[role];
  const state = renderStateOf(node);
  const empty = state === "empty";
  const scrutiny = scrutinyStatus ? scrutinyStatuses(composeCatalog)[scrutinyStatus] : null;
  const rebuttals = node.children || [];

  const cardStyle: CSSProperties = scrutiny
    ? { background: "var(--surface)", borderColor: scrutiny.color }
    : empty
      ? { background: "var(--surface-sunken)", borderColor: "var(--line-2)" }
      : { background: "var(--surface)", borderColor: "var(--line)" };

  return (
    <div className="splitCardWrap">
      <div className="splitCardShell">
      <div className="splitCard" data-ai-generated={node.node_type === "ROOT_CLAIM" ? undefined : "true"} style={cardStyle}>
        <span className="referenceStanceTab" style={{ background: pal.line }} aria-hidden />
        {scrutiny ? (
          <span className="scrutinyBadge" style={{ borderColor: scrutiny.color }}>
            <span className="scrutinyDot" style={{ background: scrutiny.color }} />
            <span style={{ color: scrutiny.color }}>{scrutiny.label}</span>
          </span>
        ) : null}
        <div className="splitCardMeta referenceMetaRow">
          <span className="roleBadge" style={{ color: pal.text, background: pal.bg, borderColor: pal.border }}>
            <span aria-hidden="true">{pal.arrow}</span> {localizedRoleLabel(node, catalog, debateChromeCatalog)}
          </span>
          <ReferenceScoreBadges node={node} v3Node={v3Node} onOpenNode={onOpenNode} condensed composeCatalog={composeCatalog} />
          <span style={{ flex: 1 }} />
          <ReferenceAuthorPill node={node} miscCatalog={miscCatalog} composeCatalog={composeCatalog} />
        </div>
        {empty ? (
          <div className="nodeEmpty">
            <span className="nodeEmptyMark" aria-hidden>
              ∅
            </span>
            <div className="nodeEmptyText">{t(catalog, "debateViews.noStrongArgument")}</div>
          </div>
        ) : (
          <>
            <button type="button" className="splitCardClaim" {...(node.claim ? textLang : {})} onClick={() => onFocus(node.id)}>
              {shownClaim(node, debateChromeCatalog)}
            </button>
            {node.active_generation?.argument ? (
              <div
                className={`threadBody${expanded ? " open" : ""}`}
                {...textLang}
                data-challenge-prose={node.id}
                onMouseUp={(event) => onProseSelect?.(node, event)}
              >
                {node.active_generation.argument}
              </div>
            ) : null}
            <div className="nodeControls nodeReferenceFooter">
              <button type="button" className="nodeCtrl focus" onClick={() => onFocus(node.id)}>
                {t(catalog, "debateViews.focus")} <span aria-hidden="true">▸</span>
              </button>
              <span style={{ flex: 1 }} />
              {node.active_generation?.argument ? (
                <button type="button" className="nodeCtrl" onClick={() => onToggleExpand(node.id)}>
                  {expanded ? t(catalog, "debateViews.showLess") : t(catalog, "debateViews.read")}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
      </div>
      {rebuttals.length > 0 ? (
        <div className="splitRebuttals">
          {rebuttals.map((child) => {
            const cr = roleOf(child);
            const cpal = cr === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[cr];
            const rel = cr === "pro"
              ? t(catalog, "debateViews.supports")
              : cr === "con"
                ? t(catalog, "debateViews.rebuts")
                : t(catalog, "debateViews.branches");
            return (
              <button
                key={child.id}
                type="button"
                className="splitRebuttal"
                style={{ borderLeftColor: cpal.line }}
                onClick={() => onFocus(child.id)}
              >
                <span className="splitRebuttalRel" style={{ color: cpal.text }}>
                  <span aria-hidden="true">↳</span> {rel}
                </span>
                <span className="splitRebuttalClaim" {...(child.claim ? textLang : {})}>
                  {renderStateOf(child) === "empty" ? t(catalog, "debateViews.noStrongArgument") : shownClaim(child, debateChromeCatalog)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
