export type Mode = "terracotta" | "chamber";

type ViewTransitionLike = {
  finished: PromiseLike<unknown>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionLike;
};

const fallbackTimers = new WeakMap<HTMLElement, number>();
const activeTransitions = new WeakSet<Document>();

function commitMode(root: HTMLElement, nextMode: Mode, onCommit?: () => void): void {
  root.dataset.mode = nextMode;
  onCommit?.();
}

function runFallback(
  document: Document,
  nextMode: Mode,
  onCommit?: () => void
): void {
  const root = document.documentElement;
  const view = document.defaultView;

  if (view === null) {
    commitMode(root, nextMode, onCommit);
    return;
  }

  const existingTimer = fallbackTimers.get(root);
  if (existingTimer !== undefined) view.clearTimeout(existingTimer);

  activeTransitions.add(document);
  root.classList.add("theme-transition-fallback");
  commitMode(root, nextMode, onCommit);

  const timer = view.setTimeout(() => {
    root.classList.remove("theme-transition-fallback");
    fallbackTimers.delete(root);
    activeTransitions.delete(document);
  }, 560);
  fallbackTimers.set(root, timer);
}

export function transitionDocumentMode(
  document: Document,
  source: Element,
  nextMode: Mode,
  onCommit?: () => void
): void {
  const root = document.documentElement;
  const view = document.defaultView;
  const reducedMotion = view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  if (activeTransitions.has(document)) return;

  if (reducedMotion) {
    commitMode(root, nextMode, onCommit);
    return;
  }

  const startViewTransition = (document as ViewTransitionDocument).startViewTransition;
  if (startViewTransition === undefined || view === null) {
    runFallback(document, nextMode, onCommit);
    return;
  }

  const bounds = source.getBoundingClientRect();
  const originX = bounds.left + bounds.width / 2;
  const originY = bounds.top + bounds.height / 2;
  const farthestX = Math.max(originX, view.innerWidth - originX);
  const farthestY = Math.max(originY, view.innerHeight - originY);
  const revealRadius = Math.hypot(farthestX, farthestY);

  root.style.setProperty("--theme-origin-x", `${originX}px`);
  root.style.setProperty("--theme-origin-y", `${originY}px`);
  root.style.setProperty("--theme-reveal-radius", `${revealRadius.toFixed(2)}px`);
  root.dataset.themeTransition = "active";
  activeTransitions.add(document);

  try {
    const transition = startViewTransition.call(document, () => {
      commitMode(root, nextMode, onCommit);
    });
    const finish = (): void => {
      delete root.dataset.themeTransition;
      activeTransitions.delete(document);
    };
    void Promise.resolve(transition.finished).then(finish, finish);
  } catch {
    delete root.dataset.themeTransition;
    activeTransitions.delete(document);
    runFallback(document, nextMode, onCommit);
  }
}
