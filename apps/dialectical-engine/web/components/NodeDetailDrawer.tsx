"use client";

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { nodeGenerations, regenerateNode } from "@/lib/api";
import type { DebateNode, Generation } from "@/lib/types";
import { ROLE_PALETTES, roleLabel, roleOf } from "@/lib/debatePresentation";
import { modelMeta } from "@/lib/models";

function looksAuthRelated(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("401") || lower.includes("403") || lower.includes("invalid user token");
}

export function NodeDetailDrawer({
  node,
  token,
  onClose,
  onChallenge,
  onQueued,
  onError,
  onAuthRejected
}: {
  node: DebateNode;
  token: string | null;
  onClose: () => void;
  onChallenge: (anchor: HTMLElement, text: string) => void;
  onQueued: () => void;
  onError: (message: string) => void;
  onAuthRejected: () => void;
}) {
  const role = roleOf(node);
  const pal = role === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[role];
  const generation = node.active_generation;
  const model = generation ? modelMeta(generation.model_id) : null;

  const [history, setHistory] = useState<Generation[]>([]);
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [compareOn, setCompareOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setHistory([]);
      return;
    }
    nodeGenerations(node.id, token)
      .then((items) => {
        if (active) setHistory(items);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, [node.id, token]);

  async function regenerate(modelId?: string) {
    if (!token || busy) return;
    setBusy(true);
    try {
      await regenerateNode(node.id, token, modelId);
      onQueued();
      onClose();
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : "Unable to regenerate";
      onError(message);
      if (looksAuthRelated(message)) onAuthRejected();
    } finally {
      setBusy(false);
    }
  }

  function selectProse(event: MouseEvent) {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 4) return;
    onChallenge(event.currentTarget as HTMLElement, text);
  }

  const current = history[selectedVersion];

  return (
    <>
      <div className="drawerScrim" onClick={onClose} />
      <aside className="drawer scroll" role="dialog" aria-modal aria-label="Argument detail">
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <span className="roleBadge" style={{ color: pal.text, background: pal.bg, borderColor: pal.border }}>
              {pal.arrow} {roleLabel(node)}
            </span>
            {model ? (
              <span className="metaLine">
                <span className="modelDot" style={{ ["--dot" as string]: model.dot }} />
                {model.name}
              </span>
            ) : null}
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawerBody">
          <div className="nodeEyebrow">Argument</div>
          <div className="drawerClaim">{node.claim}</div>
          {generation?.argument ? (
            <div className="drawerProse" onMouseUp={selectProse}>
              {generation.argument}
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 12 }}>
              No argument text yet.
            </div>
          )}
          {generation?.argument ? (
            <div className="drawerSelectHint">▲ Select any sentence above to challenge it.</div>
          ) : null}

          <div className="drawerActions">
            <button
              type="button"
              className="btn btnChallenge"
              onClick={(event) => onChallenge(event.currentTarget, "")}
            >
              ⚐ Challenge
            </button>
            <button type="button" className="btn" disabled={!token || busy} onClick={() => regenerate()}>
              ↻ Regenerate
            </button>
          </div>
          {!token ? <div className="drawerHintMuted">Unlock actions to regenerate or challenge.</div> : null}

          <div className="drawerDivider" />

          <div className="drawerHistoryHead">
            <span>Generation history</span>
            {history.length > 1 ? (
              <button type="button" className="linkBtn" onClick={() => setCompareOn((value) => !value)}>
                {compareOn ? "Hide compare" : "Compare versions"}
              </button>
            ) : null}
          </div>

          {compareOn && current ? (
            <div className="compareRow">
              <div className="compareCell current">
                <div className="compareCellHead">
                  <span className="compareTag">Current</span>
                  {model ? (
                    <span className="metaLine">
                      <span className="modelDot" style={{ ["--dot" as string]: model.dot }} />
                      {model.name}
                    </span>
                  ) : null}
                </div>
                <div className="compareClaim">{node.claim}</div>
              </div>
              <div className="compareCell">
                <div className="compareCellHead">
                  <span className="compareTag">{modelMeta(current.model_id).name}</span>
                </div>
                <div className="compareClaim muted">{current.argument.slice(0, 200)}</div>
              </div>
            </div>
          ) : null}

          <div className="historyList">
            {!token ? (
              <div className="muted">Unlock actions to view generation history.</div>
            ) : history.length === 0 ? (
              <div className="muted">No previous generations.</div>
            ) : (
              history.map((item, index) => {
                const itemModel = modelMeta(item.model_id);
                const selected = index === selectedVersion;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`historyCard${selected ? " selected" : ""}`}
                    onClick={() => {
                      setSelectedVersion(index);
                      setCompareOn(false);
                    }}
                  >
                    <div className="historyCardHead">
                      <span className="metaLine">
                        <span className="modelDot" style={{ ["--dot" as string]: itemModel.dot }} />
                        {itemModel.name}
                      </span>
                      <span className="historyTag">{item.is_active ? "active" : "archived"}</span>
                    </div>
                    <div className="historyCardBody">{item.argument}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
