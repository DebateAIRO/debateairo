export type DebateHeaderFit = {
  neededWidth: number;
  availableWidth: number;
};

export type DebateHeaderGeometry = {
  availableWidth: number;
  layout: "row" | "stacked";
  headerPaddingInline: number;
  headerGap: number;
  identityGap: number;
  claimGap: number;
  titleIntrinsicWidth: number;
  claimFixedWidths: readonly number[];
  identityFixedWidths: readonly number[];
  controlGap: number;
  controlIntrinsicWidths: readonly number[];
};

type IntrinsicWidthElement = {
  scrollWidth: number;
  getBoundingClientRect(): { width: number };
};

export type DebateHeaderGeometryElement = IntrinsicWidthElement & {
  clientWidth: number;
  children: Iterable<DebateHeaderGeometryElement>;
  classList: { contains(name: string): boolean };
};

export type DebateHeaderGeometryStyle = {
  display: string;
  paddingInlineStart: string;
  paddingInlineEnd: string;
  columnGap: string;
};

type HeaderResizeObserver<T> = {
  observe(target: T): void;
  disconnect(): void;
};

type HeaderResizeTarget = {
  addEventListener(type: "resize", listener: () => void): void;
  removeEventListener(type: "resize", listener: () => void): void;
};

/** DR-160 content-aware header collapse decision. */
export function shouldCollapseDebateHeaderActions(_fit: DebateHeaderFit): boolean {
  return _fit.neededWidth > _fit.availableWidth;
}

/** Width before flex/grid shrinking, with a rect fallback for test and browser quirks. */
export function debateHeaderElementIntrinsicWidth(element: IntrinsicWidthElement): number {
  return Math.max(element.scrollWidth, element.getBoundingClientRect().width);
}

function cssLength(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Read the DOM-facing geometry through a behavioral seam that is testable without a browser. */
export function readDebateHeaderGeometry<T extends DebateHeaderGeometryElement>(
  elements: {
    header: T;
    identity: T;
    claim: T;
    titleMeasure: T;
    controls: T;
  },
  readStyle: (element: T) => DebateHeaderGeometryStyle
): DebateHeaderGeometry {
  const isDisplayed = (element: T): boolean => readStyle(element).display !== "none";
  const gapOf = (element: T): number => cssLength(readStyle(element).columnGap);
  const claimFixedChildren = [...elements.claim.children].filter(
    (child) => child !== elements.titleMeasure && !child.classList.contains("debateTopTitle") && isDisplayed(child as T)
  );
  const identityFixedChildren = [...elements.identity.children].filter(
    (child) => child !== elements.claim && isDisplayed(child as T)
  );
  const controlChildren = [...elements.controls.children].filter(
    (child) => !child.classList.contains("debateOverflow") && isDisplayed(child as T)
  );
  const headerStyle = readStyle(elements.header);

  return {
    availableWidth: elements.header.clientWidth,
    layout: headerStyle.display === "grid" ? "stacked" : "row",
    headerPaddingInline: cssLength(headerStyle.paddingInlineStart) + cssLength(headerStyle.paddingInlineEnd),
    headerGap: gapOf(elements.header),
    identityGap: gapOf(elements.identity),
    claimGap: gapOf(elements.claim),
    titleIntrinsicWidth: debateHeaderElementIntrinsicWidth(elements.titleMeasure),
    claimFixedWidths: claimFixedChildren.map(debateHeaderElementIntrinsicWidth),
    identityFixedWidths: identityFixedChildren.map(debateHeaderElementIntrinsicWidth),
    controlGap: gapOf(elements.controls),
    controlIntrinsicWidths: controlChildren.map(debateHeaderElementIntrinsicWidth)
  };
}

function widthWithGaps(widths: readonly number[], gap: number): number {
  return widths.reduce((total, width) => total + width, 0) + gap * Math.max(0, widths.length - 1);
}

/** Measure the complete header contents before deciding whether actions fit inline. */
export function measureDebateHeaderCollapse(geometry: DebateHeaderGeometry): DebateHeaderFit & { collapse: boolean } {
  const claimWidth = widthWithGaps(
    [geometry.titleIntrinsicWidth, ...geometry.claimFixedWidths],
    geometry.claimGap
  );
  const identityWidth = widthWithGaps([claimWidth, ...geometry.identityFixedWidths], geometry.identityGap);
  const controlsWidth = widthWithGaps(geometry.controlIntrinsicWidths, geometry.controlGap);
  const contentWidth =
    geometry.layout === "stacked"
      ? Math.max(identityWidth, controlsWidth)
      : identityWidth + controlsWidth + geometry.headerGap;
  const fit = {
    neededWidth: contentWidth + geometry.headerPaddingInline,
    availableWidth: geometry.availableWidth
  };
  return { ...fit, collapse: shouldCollapseDebateHeaderActions(fit) };
}

/** Keep content-aware fit current when either content or viewport geometry changes. */
export function observeDebateHeaderFit<T>(options: {
  observer: HeaderResizeObserver<T>;
  targets: readonly T[];
  resizeTarget: HeaderResizeTarget;
  measure: () => void;
}): () => void {
  for (const target of options.targets) options.observer.observe(target);
  options.resizeTarget.addEventListener("resize", options.measure);
  return () => {
    options.observer.disconnect();
    options.resizeTarget.removeEventListener("resize", options.measure);
  };
}
