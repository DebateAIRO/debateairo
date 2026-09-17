import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { transitionDocumentMode } from "./modeTransition.ts";

function createDocument({ reducedMotion = false } = {}) {
  const dom = new JSDOM("<!doctype html><html><body><button>theme</button></body></html>", {
    pretendToBeVisual: true
  });
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: 1000 });
  Object.defineProperty(dom.window, "innerHeight", { configurable: true, value: 800 });
  dom.window.matchMedia = () => ({ matches: reducedMotion });
  return dom;
}

test("theme transition reveals the new mode outward from the pressed toggle", async () => {
  const dom = createDocument();
  const { document } = dom.window;
  const button = document.querySelector("button");
  button.getBoundingClientRect = () => ({
    x: 880,
    y: 20,
    left: 880,
    top: 20,
    right: 920,
    bottom: 60,
    width: 40,
    height: 40,
    toJSON() {}
  });

  let finishTransition;
  document.startViewTransition = (update) => {
    update();
    return {
      finished: new Promise((resolve) => {
        finishTransition = resolve;
      })
    };
  };

  transitionDocumentMode(document, button, "chamber");

  assert.equal(document.documentElement.dataset.mode, "chamber");
  assert.equal(document.documentElement.dataset.themeTransition, "active");
  assert.equal(document.documentElement.style.getPropertyValue("--theme-origin-x"), "900px");
  assert.equal(document.documentElement.style.getPropertyValue("--theme-origin-y"), "40px");
  assert.equal(document.documentElement.style.getPropertyValue("--theme-reveal-radius"), "1177.96px");

  finishTransition();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(document.documentElement.dataset.themeTransition, undefined);
  dom.window.close();
});

test("an overlapping press cannot replace or prematurely finish the active transition", async () => {
  const dom = createDocument();
  const { document } = dom.window;
  const button = document.querySelector("button");
  let finishTransition;
  document.startViewTransition = (update) => {
    update();
    return {
      finished: new Promise((resolve) => {
        finishTransition = resolve;
      })
    };
  };
  let persistedMode = null;

  transitionDocumentMode(document, button, "chamber", () => {
    persistedMode = "chamber";
  });
  transitionDocumentMode(document, button, "terracotta", () => {
    persistedMode = "terracotta";
  });

  assert.equal(document.documentElement.dataset.mode, "chamber");
  assert.equal(persistedMode, "chamber");
  assert.equal(document.documentElement.dataset.themeTransition, "active");

  finishTransition();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(document.documentElement.dataset.themeTransition, undefined);
  dom.window.close();
});

test("a rejected browser transition still releases the mode switch without an unhandled rejection", async () => {
  const dom = createDocument();
  const { document } = dom.window;
  let rejectTransition;
  document.startViewTransition = (update) => {
    update();
    return {
      finished: new Promise((_resolve, reject) => {
        rejectTransition = reject;
      })
    };
  };

  transitionDocumentMode(document, document.querySelector("button"), "chamber");
  rejectTransition(new Error("browser skipped transition"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(document.documentElement.dataset.mode, "chamber");
  assert.equal(document.documentElement.dataset.themeTransition, undefined);
  dom.window.close();
});

test("reduced-motion preference changes mode without starting an animation", () => {
  const dom = createDocument({ reducedMotion: true });
  const { document } = dom.window;
  document.startViewTransition = () => {
    throw new Error("reduced motion must bypass view transitions");
  };

  transitionDocumentMode(document, document.querySelector("button"), "chamber");

  assert.equal(document.documentElement.dataset.mode, "chamber");
  assert.equal(document.documentElement.dataset.themeTransition, undefined);
  dom.window.close();
});

test("browsers without view transitions receive and then clear the eased color fallback", async () => {
  const dom = createDocument();
  const { document } = dom.window;

  transitionDocumentMode(document, document.querySelector("button"), "chamber");

  assert.equal(document.documentElement.dataset.mode, "chamber");
  assert.equal(document.documentElement.classList.contains("theme-transition-fallback"), true);

  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(document.documentElement.classList.contains("theme-transition-fallback"), false);
  dom.window.close();
});
