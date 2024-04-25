/**
 * The PerformanceElementTiming interface contains render timing information for image and text node elements the developer annotated with an elementtiming attribute for observation.
 *
 * [MDN Reference](https://developer.mozilla.org/docs/Web/API/PerformanceElementTiming)
 */
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

interface PerformanceContainerTiming extends PerformanceElementTiming {
  paintedRects: Set<DOMRectReadOnly>;
  tempPaintedRects?: Set<DOMRectReadOnly>;
  coordData?: any;
}
type ResolvedRootData = PerformanceContainerTiming;
(window as any).rectsPainted = [];

// We need to set the element timing attribute tag on all elements below "containertiming" before we can start observing
// Otherwise no elements will be observed
const INTERNAL_ATTR_NAME = "POLYFILL-ELEMENTTIMING";
const containerTimingAttrSelector = "[containertiming]";
const nativePerformanceObserver = window.PerformanceObserver;
// containerRoots needs to be set before "observe" has initiated due to the fact new elements could have been injected earlier
const containerRoots = new Set<Element>();
const containerRootDataMap = new Map<Element, PerformanceContainerTiming>();
// Keep track of containers that need updating (sub elements have painted), this is reset between observer callbacks
const containerRootUpdates = new Set<Element>();

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
  callback: PerformanceObserverCallback;
  override: boolean;
  debug: boolean;
  method: string;
  static supportedEntryTypes = nativePerformanceObserver.supportedEntryTypes;

  constructor(
    callback: PerformanceObserverCallback,
    method: "aggregatedPaints" | "newAreaPainted" = "aggregatedPaints",
  ) {
    console.log(method);
    this.nativePerformanceObserver = new nativePerformanceObserver(
      this.callbackWrapper.bind(this),
    );
    this.callback = callback;
    // If this polyfill is being used we can assume we're actively overriding PerformanceObserver
    this.override = true;
    this.debug = (window as any).ctDebug;
    this.method = method;
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
      name: "",
      duration: 0,
      element: null,
      entryType: "",
      identifier: "",
      intersectionRect: new DOMRectReadOnly(),
      lastPaintedSubElement: null,
      naturalHeight: 0,
      naturalWidth: 0,
      renderTime: 0,
      size: 0,
      startTime: 0,
      toJSON: () => {},
      url: "",
    };

    return resolvedRootData;
  }

  static paintDebugOverlay(rectData: DOMRectReadOnly | Set<DOMRectReadOnly>) {
    const divCol: Set<Element> = new Set();
    const addOverlayToRect = (rectData: DOMRectReadOnly) => {
      const div = document.createElement("div");
      div.classList.add("polyfill--ctDebugOverlay");
      div.style.backgroundColor = "#00800078";
      div.style.width = `${rectData.width}px`;
      div.style.height = `${rectData.height}px`;
      div.style.top = `${rectData.top}px`;
      div.style.left = `${rectData.left}px`;
      div.style.position = "fixed";
      div.style.transition = "background-color 1s";
      document.body.appendChild(div);
      divCol.add(div);
    };

    if (rectData instanceof Set) {
      rectData?.forEach((rect) => {
        console.log(rect);
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

    // setTimeout(() => {
    //   divCol.forEach((div) => {
    //     div.remove();
    //   });
    // }, 2000);
  }

  observe(options: PerformanceObserverInit) {
    // If we're not observing element timing we should just "pass through" to the normal PerformanceObserver
    if (
      options.type !== "element" &&
      !options?.entryTypes?.includes("element")
    ) {
      this.override = false;
      this.nativePerformanceObserver.observe(options);
      return;
    }

    this.nativePerformanceObserver.observe(options);
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

    // This is an elementtiming we added rather than one which was there initially, remove it and grab the data
    resolvedRootData.name = entry.name;
    resolvedRootData.url = entry.url;
    resolvedRootData.renderTime = entry.renderTime;
    resolvedRootData.lastPaintedSubElement = entry.element;
    resolvedRootData.startTime ??= entry.startTime;
    resolvedRootData.intersectionRect = new DOMRectReadOnly(
      coordData.minX,
      coordData.minY,
      width,
      height,
    );
    resolvedRootData.size = width * height;
    resolvedRootData.coordData = coordData;
    containerRootDataMap.set(closestRoot, resolvedRootData);

    // Because we've updated a container we should mark it as updated so we can return it with the list
    containerRootUpdates.add(closestRoot);
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

    const mergeRects = (
      rectA: DOMRectReadOnly,
      rectB: DOMRectReadOnly,
    ): DOMRectReadOnly => {
      const minX = Math.min(rectA.left, rectB.left);
      const maxX = Math.max(rectA.right, rectB.right);
      const minY = Math.min(rectA.top, rectB.top);
      const maxY = Math.max(rectA.bottom, rectB.bottom);
      return new DOMRectReadOnly(minX, minY, maxX - minX, maxY - minY);
    };

    const canMerge = (rectA: DOMRectReadOnly, rectB: DOMRectReadOnly) => {
      // Proximity tolerance
      const pt = 30;
      // We already throw away overlapping rectangles (TODO we may want to merge overlaps too)
      // We should merge rectangles which are within proximity so we have a "painted area".
      const horizontalMerge =
        rectA.bottom >= rectB.top - pt &&
        rectA.top <= rectB.bottom + pt &&
        (Math.abs(rectA.right - rectB.left) <= pt ||
          Math.abs(rectA.left - rectB.right) <= pt);

      const verticalMerge =
        rectA.right >= rectB.left - pt &&
        rectA.left <= rectB.right + pt &&
        (Math.abs(rectA.bottom - rectB.top) <= pt ||
          Math.abs(rectA.top - rectB.bottom) <= pt);

      return horizontalMerge || verticalMerge;
    };

    // Check if we have new rectangles or are just painting over old areas
    let entryRect = entry.intersectionRect;
    if (resolvedRootData.paintedRects.size === 0) {
      resolvedRootData.paintedRects?.add(entryRect);
    } else {
      let mergedRect;
      let merged: boolean = false;
      resolvedRootData.paintedRects.forEach((rect) => {
        if (canMerge(rect, entryRect) && !merged) {
          console.log("can merge");
          mergedRect = mergeRects(rect, entryRect);
          resolvedRootData.paintedRects.delete(rect);
          // Mark this rect as merged, but don't merge in the loop
          merged = true;
        }
      });

      if (mergedRect) {
        resolvedRootData.paintedRects.add(mergedRect);
      } else {
        resolvedRootData.paintedRects.add(entryRect);
      }
    }

    // This is an elementtiming we added rather than one which was there initially, remove it and grab the data
    resolvedRootData.name = entry.name;
    resolvedRootData.url = entry.url;
    resolvedRootData.renderTime = entry.renderTime;
    resolvedRootData.lastPaintedSubElement = entry.element;
    resolvedRootData.startTime ??= entry.startTime;
    resolvedRootData.intersectionRect = entry.intersectionRect;

    // Update States
    containerRootDataMap.set(closestRoot, resolvedRootData);
    containerRootUpdates.add(closestRoot);
  }

  overlaps(rectA: DOMRectReadOnly, rectB: DOMRectReadOnly): boolean {
    return !(
      rectB.left > rectA.right ||
      rectB.right < rectA.left ||
      rectB.top > rectA.bottom ||
      rectB.bottom < rectA.top
    );
  }

  /**
   * This will wrap the callback and add extra fields for container elements
   * @param {PerformanceObserverEntryList} list
   */
  callbackWrapper(list: PerformanceObserverEntryList) {
    // Check list for element timing entries, we don't care about other event type
    // Also if we're not actively observing element timing (override) don't bother augmenting
    if (
      this.override === false ||
      list.getEntriesByType("element").length === 0
    ) {
      this.callback(list, this.nativePerformanceObserver);
      return;
    }

    // Reset coordData for each container
    containerRootDataMap.forEach((val) => {
      val.coordData = null;
      val.paintedRects?.clear();
    });

    // Have any containers been updated?
    containerRootUpdates.clear();

    // Strip elements from the final list that we've added via the polyfill as not to pollute the final set of results.
    const filterEntries = (entry: PerformanceEntry) => {
      // This should ensure we're dealing with a PerformanceElementTiming instance
      // We can't use instanceOf here as the class doesn't exist at the time of writing
      if (entry.entryType !== "element") {
        return true;
      }

      const entryElmTiming = entry as PerformanceElementTiming;
      const element = entryElmTiming.element;
      if (!element) {
        return false;
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

        // If elementtiming was explicitly set, we should preserve this entry as the developer wanted this information
        if (element.getAttribute("initial-elementtiming-set")) {
          return true;
        }

        return false;
      }

      return true;
    };

    // If any updates have happened within a container add the container to the results too
    // We achieve this by checking containerRootUpdates for entries
    const concatContainersIfNeeded = () => {
      const containerEntries: PerformanceContainerTiming[] = [];
      // If any of these updates happened in a container, add the container to the end of the list
      containerRootUpdates.forEach((root) => {
        const resolvedRootData = containerRootDataMap.get(root);
        if (!resolvedRootData) {
          return;
        }

        containerEntries.push({
          duration: 0,
          naturalHeight: 0,
          naturalWidth: 0,
          intersectionRect: resolvedRootData.intersectionRect,
          size: resolvedRootData.size,
          element: root,
          entryType: "container-element",
          renderTime: resolvedRootData.renderTime,
          url: resolvedRootData.url,
          name: resolvedRootData.name,
          identifier: root.getAttribute("elementtiming"),
          lastPaintedSubElement: resolvedRootData.lastPaintedSubElement,
          startTime: resolvedRootData.startTime,
          toJSON: () => JSON.stringify(this),
          paintedRects: resolvedRootData.paintedRects,
        });

        if (this.debug) {
          if (this.method === "newAreaPainted") {
            const rects = resolvedRootData.paintedRects;
            ContainerPerformanceObserver.paintDebugOverlay(rects);
          }
          // debug mode shows the painted rectangles
          ContainerPerformanceObserver.paintDebugOverlay(
            resolvedRootData.intersectionRect,
          );
        }
      });

      return containerEntries;
    };

    const syntheticList = {
      getEntriesByType: (type: string) => {
        return list
          .getEntriesByType(type)
          .filter(filterEntries)
          .concat(concatContainersIfNeeded());
      },
      getEntries: () => {
        return list
          .getEntries()
          .filter(filterEntries)
          .concat(concatContainersIfNeeded());
      },
      getEntriesByName: (name: string) => {
        return list
          .getEntriesByName(name)
          .filter(filterEntries)
          .concat(concatContainersIfNeeded());
      },
    };

    this.callback(syntheticList, this);
  }
}

window.PerformanceObserver = ContainerPerformanceObserver;
