"use client";

import type { DebateNode } from "@/lib/types";
import { partitionArgumentChildren, perspectiveChildren } from "@/lib/debateTreeUtils";
import { ArgumentNodeCard } from "@/components/DebateTree";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import miscEnglish from "@/messages/en/misc.json";
import debateChromeEnglish from "@/messages/en/debateChrome.json";
import composeEnglish from "@/messages/en/compose.json";

type ArgumentFocusViewProps = {
  rootNode: DebateNode;
  selectedNode: DebateNode;
  selectedPath: DebateNode[];
  token: string | null;
  onError: (message: string) => void;
  onSelectNode: (nodeId: string) => void;
  /** The interface locale's `misc` catalogue, for the model badges. */
  miscCatalog?: MessageCatalog;
  /** The interface locale's `debateChrome` catalogue: branch labels. */
  debateChromeCatalog?: MessageCatalog;
  /** The interface locale's `compose` catalogue: model family names. */
  composeCatalog?: MessageCatalog;
};

export function ArgumentFocusView({
  rootNode,
  selectedNode,
  selectedPath,
  token,
  onError,
  onSelectNode,
  miscCatalog = miscEnglish,
  debateChromeCatalog = debateChromeEnglish,
  composeCatalog = composeEnglish,
}: ArgumentFocusViewProps) {
  const { catalog, locale } = useChromeI18n();
  const parentNode = selectedPath.length > 1 ? selectedPath[selectedPath.length - 2] : null;
  const contextNode = parentNode ?? rootNode;
  const isRootFocused = selectedNode.node_type === "ROOT_CLAIM";
  const perspectives = perspectiveChildren(selectedNode);
  const { proChildren, conChildren } = partitionArgumentChildren(selectedNode);

  function renderChildCards(children: DebateNode[], emptyText: string) {
    if (children.length === 0) {
      return <p className="argumentColumnEmpty">{emptyText}</p>;
    }

    return (
      <div className="argumentColumnList">
        {children.map((child) => (
          <ArgumentNodeCard
            key={child.id}
            node={child}
            token={token}
            onError={onError}
            onSelectNode={onSelectNode}
            miscCatalog={miscCatalog}
            debateChromeCatalog={debateChromeCatalog}
            composeCatalog={composeCatalog}
            isSelected={child.id === selectedNode.id}
            selectionLabel={t(catalog, "debateViews.focusChildArgument", { claim: child.claim })}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="argumentFocusView" aria-label={t(catalog, "debateViews.focusedArgument")}>
      <header className="argumentFocusHeader">
        <div>
          <span className="argumentFocusEyebrow">{t(catalog, "debateViews.debateTopic")}</span>
          <h2>{rootNode.claim}</h2>
        </div>
      </header>
      <nav className="argumentFocusRail" aria-label={t(catalog, "debateViews.argumentPath")}>
        <div className="argumentPath">
          {selectedPath.map((node, index) => (
            <button
              key={node.id}
              className="argumentPathButton secondary"
              type="button"
              aria-current={node.id === selectedNode.id ? "page" : undefined}
              aria-label={t(catalog, "debateViews.selectPathArgument", { index: index + 1, claim: node.claim })}
              onClick={() => onSelectNode(node.id)}
            >
              <span className="argumentPathIndex">{index + 1}</span>
              <span className="argumentPathClaim">{node.claim}</span>
            </button>
          ))}
        </div>
        {parentNode ? (
          <button className="secondary" type="button" aria-label={t(catalog, "debateViews.moveToParentArgument", { claim: parentNode.claim })} onClick={() => onSelectNode(parentNode.id)}>
            {t(catalog, "debateViews.up")}
          </button>
        ) : null}
      </nav>
      <section
        key={`context-${contextNode.id}`}
        className="argumentContextPanel argumentFocusTransition"
        aria-label={parentNode ? t(catalog, "debateViews.parentArgumentContext") : t(catalog, "debateViews.rootClaimContext")}
      >
        <div className="argumentContextLabel">{parentNode ? t(catalog, "debateViews.parentContext") : t(catalog, "debateViews.rootContext")}</div>
        <button
          className="argumentContextCard"
          type="button"
          aria-label={t(catalog, "debateViews.focusContextArgument", { claim: contextNode.claim })}
          onClick={() => onSelectNode(contextNode.id)}
        >
          <span className="badge">{parentNode ? t(catalog, "debateViews.parent") : t(catalog, "debateViews.root")}</span>
          <span>{contextNode.claim}</span>
        </button>
      </section>
      <div key={`focus-${selectedNode.id}`} className="argumentFocusCard argumentFocusTransition">
        <ArgumentNodeCard
          node={selectedNode}
          token={token}
          onError={onError}
          onSelectNode={onSelectNode}
          miscCatalog={miscCatalog}
          debateChromeCatalog={debateChromeCatalog}
          composeCatalog={composeCatalog}
          isSelected
          selectionLabel={t(catalog, "debateViews.selectedArgument", { claim: selectedNode.claim })}
        />
      </div>
      {isRootFocused ? (
        <section
          key={`perspectives-${selectedNode.id}`}
          className="argumentPerspectivesFocus argumentFocusTransition"
          aria-labelledby="focused-perspectives-heading"
        >
          <div className="argumentColumnHeading">
            <h3 id="focused-perspectives-heading">{t(catalog, "debateViews.perspectives")}</h3>
            <span aria-label={tPlural(catalog, "debateViews.perspectiveCount", perspectives.length, locale)}>
              {perspectives.length}
            </span>
          </div>
          {perspectives.length > 0 ? (
            <div className="argumentPerspectiveGrid">
              {perspectives.map((child) => (
                <ArgumentNodeCard
                  key={child.id}
                  node={child}
                  token={token}
                  onError={onError}
                  onSelectNode={onSelectNode}
                  miscCatalog={miscCatalog}
                  debateChromeCatalog={debateChromeCatalog}
                  composeCatalog={composeCatalog}
                  selectionLabel={t(catalog, "debateViews.focusPerspective", { claim: child.claim })}
                />
              ))}
            </div>
          ) : (
            <p className="argumentColumnEmpty">{t(catalog, "debateViews.noPerspectivesYet")}</p>
          )}
        </section>
      ) : (
        <div key={`columns-${selectedNode.id}`} className="argumentColumnsFocus argumentFocusTransition" aria-label={t(catalog, "debateViews.directChildArguments")}>
          <section className="argumentColumn" aria-labelledby="focused-pros-heading">
            <div className="argumentColumnHeading">
              <h3 id="focused-pros-heading">{t(catalog, "debateViews.pros")}</h3>
              <span aria-label={tPlural(catalog, "debateViews.proArgumentCount", proChildren.length, locale)}>
                {proChildren.length}
              </span>
            </div>
            {renderChildCards(proChildren, t(catalog, "debateViews.noProsYet"))}
          </section>
          <section className="argumentColumn" aria-labelledby="focused-cons-heading">
            <div className="argumentColumnHeading">
              <h3 id="focused-cons-heading">{t(catalog, "debateViews.cons")}</h3>
              <span aria-label={tPlural(catalog, "debateViews.conArgumentCount", conChildren.length, locale)}>
                {conChildren.length}
              </span>
            </div>
            {renderChildCards(conChildren, t(catalog, "debateViews.noConsYet"))}
          </section>
        </div>
      )}
    </section>
  );
}
