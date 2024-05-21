interface PerformanceElementTiming extends PerformanceEntry {
  name: string;
  lastPaintedSubElement: Element | null;
  intersectionRect: DOMRectReadOnly;
  naturalHeight: number;
  naturalWidth: number;
  element: Element | null;
  identifier: string | null;
  url: string;
  renderTime: number;
  startTime: number;
  size: number;
}

interface PerformanceContainerTiming {
  intersectionRect: DOMRectReadOnly | undefined;
  renderTime?: number;
  firstContentfulPaint: { renderTime: number; element: Element | null } | null;
  visuallyCompletePaint?: any;
  identifier: string | null;
  lastPaintedSubElement?: Element | null;
  size: number;
  startTime: number;
  largestContentfulPaint: { size: number; element: Element | null } | null;
}
interface ResolvedRootData extends PerformanceContainerTiming {
  /** Keep track of all the paintedRects */
  paintedRects: Set<DOMRectReadOnly>;
  /** For aggregated paints keep track of the union painted rect */
  coordData?: any;
}

type ObserveOptions = {
  nestedStrategy: "ignore" | "transparent";
  method: "aggregatedPaints" | "newAreaPainted";
};

// We need to set the element timing attribute tag on all elements below "containertiming" before we can start observing
// Otherwise no elements will be observed
const INTERNAL_ATTR_NAME = "POLYFILL-ELEMENTTIMING";
const containerTimingAttrSelector = "[containertiming]";
const NativePerformanceObserver = window.PerformanceObserver;
// containerRoots needs to be set before "observe" has initiated due to the fact new elements could have been injected earlier
const containerRoots = new Set<Element>();
const containerRootDataMap = new Map<Element, ResolvedRootData>();
// Keep track of containers that need updating (sub elements have painted), this is reset between observer callbacks
const containerRootUpdates = new Set<Element>();
// Keep track of the last set of resolved data so it can be shown in debug mode
let lastResolvedData: Partial<{
  paintedRects: Set<DOMRectReadOnly>;
  intersectionRect: DOMRectReadOnly;
}>;

const mutationObserverCallback = (mutationList: MutationRecord[]) => {
  const findContainers = (parentNode: Element) => {
    // We've found a container
    if (parentNode.matches && parentNode.matches(containerTimingAttrSelector)) {
      ContainerPerformanceObserver.setDescendants(parentNode);
      containerRoots.add(parentNode);
      // we don't support nested containers right now so don't bother looking for more containers
      // TODO: How would this work if we have nested containers?
      return;
    }

    // A node was injected into the DOM with children, navigate through the children to find a container
    if (parentNode.children) {
      Array.from(parentNode.children).forEach(findContainers);
    }
  };

  for (const mutation of mutationList) {
    if (mutation.type === "childList" && mutation.addedNodes.length) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node.nodeType !== 1) {
          continue;
        }

        // At this point we can be certain we're dealing with an element
        const element = node as Element;

        // Theres a chance the new sub-tree injected is a descendent of a container that was already in the DOM
        // Go through the container have currently and check..
        if (element.closest(containerTimingAttrSelector)) {
          // Set on the element itself
          ContainerPerformanceObserver.setElementTiming(element);
          // Set on the elements children (if any)
          ContainerPerformanceObserver.setDescendants(element);
          continue;
        }

        // If there's no containers above, we should check for containers inside
        findContainers(element);
      }
    }
  }
};

// Wait until the DOM is ready then start collecting elements needed to be timed.
document.addEventListener("DOMContentLoaded", () => {
  const mutationObserver = new window.MutationObserver(
    mutationObserverCallback,
  );

  const config = { attributes: false, childList: true, subtree: true };
  mutationObserver.observe(document, config);

  const elms = document.querySelectorAll(containerTimingAttrSelector);
  elms.forEach((elm) => {
    containerRoots.add(elm);
    ContainerPerformanceObserver.setDescendants(elm);
  });
});

/**
 * Container Performance Observer is a superset of Performance Observer which can augment element-timing to work on containers
 */
class ContainerPerformanceObserver {
  nativePerformanceObserver: PerformanceObserver;
  debug: boolean;
  method: ObserveOptions["method"] = "newAreaPainted";
  nestedStrategy: ObserveOptions["nestedStrategy"] = "ignore";
  callback: (list: {
    getEntries: () => PerformanceContainerTiming[];
  }) => PerformanceContainerTiming[];

  static supportedEntryTypes = NativePerformanceObserver.supportedEntryTypes;

  constructor(
    callback: (list: {
      getEntries: () => PerformanceContainerTiming[];
    }) => PerformanceContainerTiming[],
  ) {
    this.nativePerformanceObserver = new NativePerformanceObserver(
      this.callbackWrapper.bind(this),
    );
    this.callback = callback;
    this.debug = (window as any).ctDebug;
  }

  static walkDescendants(elm: Element, callback: (elm: Element) => void) {
    const walkChildren = ({ children }: Element) => {
      const normalizedChildren = Array.from(children);
      normalizedChildren.forEach((child) => {
        callback(child);
        if (child.children.length) {
          walkChildren(child);
        }
      });
    };

    walkChildren(elm);
  }

  static setElementTiming(el: Element) {
    // We should keep track of elements which were already marked with element timing so we can still display those results
    // Sometimes DOM Nodes with the polyfilled-elementtiming are detached then re-attached to the DOM so check for these
    if (
      el.hasAttribute("elementtiming") &&
      el.attributes.getNamedItem("elementtiming")?.value !== INTERNAL_ATTR_NAME
    ) {
      el.setAttribute("initial-elementtiming-set", "true");
      return;
    }

    el.setAttribute("elementtiming", INTERNAL_ATTR_NAME);
  }

  /**
   * Recursively count the elements below the current node (ignoring containers or other element timing elements)
   */
  static setDescendants(el: Element) {
    ContainerPerformanceObserver.walkDescendants(
      el,
      ContainerPerformanceObserver.setElementTiming,
    );
  }

  static getResolvedDataFromContainerRoot(
    container: Element,
  ): ResolvedRootData {
    const resolvedRootData: ResolvedRootData = containerRootDataMap.get(
      container,
    ) ?? {
      paintedRects: new Set(),
      identifier: "",
      intersectionRect: new DOMRectReadOnly(),
      renderTime: 0,
      size: 0,
      startTime: 0,
      largestContentfulPaint: null,
      firstContentfulPaint: null,
    };

    return resolvedRootData;
  }

  static paintDebugOverlay(rectData?: DOMRectReadOnly | Set<DOMRectReadOnly>) {
    if (!rectData) {
      return;
    }

    const divCol: Set<Element> = new Set();
    const addOverlayToRect = (rectData: DOMRectReadOnly) => {
      const div = document.createElement("div");
      div.classList.add("polyfill--ctDebugOverlay");
      div.style.backgroundColor = "#00800078";
      div.style.width = `${rectData.width}px`;
      div.style.height = `${rectData.height}px`;
      div.style.top = `${rectData.top}px`;
      div.style.left = `${rectData.left}px`;
      div.style.position = "absolute";
      div.style.transition = "background-color 1s";
      document.body.appendChild(div);
      divCol.add(div);
    };

    if (rectData instanceof Set) {
      rectData?.forEach((rect) => {
        addOverlayToRect(rect);
      });
    } else {
      addOverlayToRect(rectData);
    }

    setTimeout(() => {
      divCol.forEach((div) => {
        (div as HTMLDivElement).style.backgroundColor = "transparent";
      });
    }, 1000);

    setTimeout(() => {
      divCol.forEach((div) => {
        div.remove();
      });
    }, 2000);
  }

  observe(options: ObserveOptions) {
    this.method = options.method;
    this.nestedStrategy = options.nestedStrategy;
    this.nativePerformanceObserver.observe({ type: "element", buffered: true });
  }

  disconnect() {
    this.nativePerformanceObserver.disconnect();
  }

  takeRecords() {
    return this.nativePerformanceObserver.takeRecords();
  }

  /**
   *  This algorithm collects the paints which have happened within the nearest container and emits the largest rectangle
   *  that is the union of all painted elements. Due to the nature of the underlying `element-timing` algorithm only new areas
   *  should be painted unless the DOM elements have been swapped out in various positions.
   */
  aggregatedPaints(entry: PerformanceElementTiming, closestRoot: Element) {
    const resolvedRootData =
      ContainerPerformanceObserver.getResolvedDataFromContainerRoot(
        closestRoot,
      );
    const coordData = resolvedRootData.coordData ?? {
      // Calculate the smallest rectangle that contains a union of all nodes which were painted in this container
      // Keep track of the smallest/largest painted rectangles as we go through them in filterEnt
      minX: Number.MAX_SAFE_INTEGER,
      minY: Number.MAX_SAFE_INTEGER,
      maxX: Number.MIN_SAFE_INTEGER,
      maxY: Number.MIN_SAFE_INTEGER,
    };
    coordData.minX = Math.min(coordData.minX, entry.intersectionRect.left);
    coordData.minY = Math.min(coordData.minY, entry.intersectionRect.top);
    coordData.maxX = Math.max(coordData.maxX, entry.intersectionRect.right);
    coordData.maxY = Math.max(coordData.maxY, entry.intersectionRect.bottom);
    const width = coordData.maxX - coordData.minX;
    const height = coordData.maxY - coordData.minY;
    const newRect = new DOMRectReadOnly(
      coordData.minX,
      coordData.minY,
      width,
      height,
    );

    // This is an elementtiming we added rather than one which was there initially, remove it and grab the data
    resolvedRootData.renderTime = entry.renderTime;
    resolvedRootData.lastPaintedSubElement = entry.element;
    resolvedRootData.startTime ||= entry.startTime;
    resolvedRootData.intersectionRect = newRect;
    resolvedRootData.size = width * height;
    resolvedRootData.coordData = coordData;
    containerRootDataMap.set(closestRoot, resolvedRootData);

    // Because we've updated a container we should mark it as updated so we can return it with the list
    containerRootUpdates.add(closestRoot);
    lastResolvedData.intersectionRect = newRect;

    // If nested update any parents
    this.updateParentIfExists(closestRoot);
  }

  /**
   *  This algorithm retains the coordinates that have been painted previously and emits only new rectangles that have
   *  been painted. This requires having some state to know which areas have already been covered, so we need to keep hold
   *  of painted rects.
   */
  emitNewAreaPainted(entry: PerformanceElementTiming, closestRoot: Element) {
    const resolvedRootData =
      ContainerPerformanceObserver.getResolvedDataFromContainerRoot(
        closestRoot,
      );
    const incomingEntrySize = ContainerPerformanceObserver.size(
      entry.intersectionRect,
    );
    const currentContainerSize =
      resolvedRootData.largestContentfulPaint?.size ?? 0;

    // There's a weird bug where we sometimes get a load of empty rects (all zero'd out)
    if (ContainerPerformanceObserver.isEmptyRect(entry.intersectionRect)) {
      return;
    }

    // We need to keep track of LCP so grab the size
    if (incomingEntrySize > currentContainerSize) {
      resolvedRootData.largestContentfulPaint = {
        size: incomingEntrySize,
        element: entry.element,
      };
    }

    // Check for overlaps
    let overlap = false;
    resolvedRootData.paintedRects.forEach((rect) => {
      if (ContainerPerformanceObserver.overlaps(entry.intersectionRect, rect)) {
        overlap = true;
      }
    });

    if (overlap) {
      return;
    }

    resolvedRootData.renderTime = entry.renderTime;
    resolvedRootData.lastPaintedSubElement = entry.element;
    resolvedRootData.startTime ||= entry.startTime;
    resolvedRootData.intersectionRect = undefined;
    resolvedRootData.paintedRects?.add(entry.intersectionRect);
    resolvedRootData.size += incomingEntrySize;
    resolvedRootData.identifier ||= closestRoot.getAttribute("containertiming");
    resolvedRootData.firstContentfulPaint ??= {
      renderTime: entry.renderTime,
      element: entry.element,
    };

    // Update States
    containerRootDataMap.set(closestRoot, resolvedRootData);
    containerRootUpdates.add(closestRoot);
    lastResolvedData.paintedRects?.add(entry.intersectionRect);

    // If nested update any parents
    this.updateParentIfExists(closestRoot);
  }

  // The container may have a parent container, if it does we should pass values up the chain
  updateParentIfExists(containerRoot: Element): void {
    const strategy = this.nestedStrategy;
    // The containerRoot itself has this selector, so to avoid self-matching we should go one level up
    const parentRoot =
      containerRoot.parentElement?.closest("[containertiming]");
    // If there's no parent we don't need to do anything here
    // Also if we set ignore we don't need to alert any parent container
    if (!parentRoot || strategy === "ignore") {
      return;
    }

    const resolvedData =
      ContainerPerformanceObserver.getResolvedDataFromContainerRoot(
        containerRoot,
      );
    const resolvedParentData =
      ContainerPerformanceObserver.getResolvedDataFromContainerRoot(parentRoot);

    const rLcp = resolvedData.largestContentfulPaint?.size ?? 0;
    const rpLcp = resolvedParentData.largestContentfulPaint?.size ?? 0;

    const rFcp = resolvedData.firstContentfulPaint?.renderTime ?? Infinity;
    const rpFcp =
      resolvedParentData.firstContentfulPaint?.renderTime ?? Infinity;

    const rrt = resolvedData.renderTime ?? 0;
    const rprt = resolvedParentData.renderTime ?? 0;

    // Check LCP, if there's a larger LCP we should promote it upwards
    if (rLcp > rpLcp) {
      resolvedParentData.largestContentfulPaint =
        resolvedData.largestContentfulPaint;
      containerRootUpdates.add(parentRoot);
    }

    // Check FCP, if there's a faster time we should promote it upwards
    if (rFcp < rpFcp) {
      resolvedParentData.firstContentfulPaint =
        resolvedData.firstContentfulPaint;
      containerRootUpdates.add(parentRoot);
    }

    // Check Visually Complete
    if (rrt > rprt) {
      resolvedData.renderTime = resolvedParentData.renderTime;
      containerRootUpdates.add(parentRoot);
    }
  }

  static overlaps(rectA: DOMRectReadOnly, rectB: DOMRectReadOnly): boolean {
    return !(
      rectB.left > rectA.right ||
      rectB.right < rectA.left ||
      rectB.top > rectA.bottom ||
      rectB.bottom < rectA.top
    );
  }

  static isEmptyRect(rect: DOMRectReadOnly): boolean {
    return rect.width === 0 && rect.height === 0;
  }

  static size(rect: { width: number; height: number }): number {
    return rect.width * rect.height;
  }

  /**
   * This will wrap the callback and add extra fields for container elements
   * @param {PerformanceObserverEntryList} list
   */
  callbackWrapper(list: PerformanceObserverEntryList) {
    // Reset coordData for each container
    containerRootDataMap.forEach((val) => {
      val.coordData = null;
    });

    // Have any containers been updated?
    containerRootUpdates.clear();

    // Reset last resolved data state
    lastResolvedData = { paintedRects: new Set() };

    const processEntries = (entry: PerformanceEntry): void => {
      // This should ensure we're dealing with a PerformanceElementTiming instance
      // We can't use instanceOf here as the class doesn't exist at the time of writing
      if (entry.entryType !== "element") {
        return;
      }

      const entryElmTiming = entry as PerformanceElementTiming;
      const element = entryElmTiming.element;
      if (!element) {
        return;
      }

      const closestRoot = element.closest(containerTimingAttrSelector);
      if (
        element.getAttribute("elementtiming") === INTERNAL_ATTR_NAME &&
        closestRoot
      ) {
        if (this.method === "aggregatedPaints") {
          this.aggregatedPaints(entry as PerformanceElementTiming, closestRoot);
        } else {
          this.emitNewAreaPainted(
            entry as PerformanceElementTiming,
            closestRoot,
          );
        }
      }
    };

    // If any updates have happened within a container add the container to the results too
    // We achieve this by checking containerRootUpdates for entries
    const fetchUpdatedContainers = () => {
      const containerEntries: PerformanceContainerTiming[] = [];
      // If any of these updates happened in a container, add the container to the end of the list
      containerRootUpdates.forEach((root) => {
        const resolvedRootData = containerRootDataMap.get(root);
        if (!resolvedRootData) {
          return;
        }
        const containerCandidate: PerformanceContainerTiming = {
          intersectionRect: resolvedRootData.intersectionRect,
          size: resolvedRootData.size,
          renderTime: resolvedRootData.renderTime,
          identifier: resolvedRootData.identifier,
          lastPaintedSubElement: resolvedRootData.lastPaintedSubElement,
          largestContentfulPaint: resolvedRootData.largestContentfulPaint,
          firstContentfulPaint: resolvedRootData.firstContentfulPaint,
          startTime: resolvedRootData.startTime,
        };

        if (this.method === "newAreaPainted") {
          containerCandidate.renderTime = undefined;
          containerCandidate.visuallyCompletePaint = {
            renderTime: resolvedRootData.renderTime,
            lastPaintedSubElement: resolvedRootData.lastPaintedSubElement,
          };
        }

        containerEntries.push(containerCandidate);

        if (this.debug) {
          if (this.method === "newAreaPainted") {
            const rects = lastResolvedData?.paintedRects;
            ContainerPerformanceObserver.paintDebugOverlay(rects);
            return;
          }
          if (lastResolvedData.intersectionRect) {
            // debug mode shows the painted rectangles
            ContainerPerformanceObserver.paintDebugOverlay(
              lastResolvedData.intersectionRect,
            );
          }
        }
      });

      return containerEntries;
    };

    list.getEntries().forEach(processEntries);
    const containers = fetchUpdatedContainers();

    const syntheticList = {
      getEntries: () => containers,
    };

    this.callback(syntheticList);
  }
}
