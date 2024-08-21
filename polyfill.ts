// https://wicg.github.io/element-timing/#performanceelementtiming
interface PerformanceElementTiming extends PerformanceEntry {
  name: string;
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

interface PerformanceContainerTiming extends PerformanceEntry {
  firstRenderTime: number;
  identifier: string | null;
  lastPaintedSubElement?: Element | null;
  size: number;
  startTime: number;
}
interface ResolvedRootData extends PerformanceContainerTiming {
  /** Keep track of all the paintedRects */
  paintedRects: Set<DOMRectReadOnly>;
  /** For aggregated paints keep track of the union painted rect */
  coordData?: any;
  /** For aggregated paints keep track of the union painted rect */
  batchCoordData?: any;
}

type ObserveOptions = {
  nestedStrategy: "ignore" | "transparent" | "shadowed";
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
      entryType: "container",
      name: "",
      duration: 0,
      paintedRects: new Set(),
      identifier: "",
      size: 0,
      startTime: 0,
      firstRenderTime: 0,
      toJSON: () => {},
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
    this.nestedStrategy = options.nestedStrategy;
    this.nativePerformanceObserver.observe({ type: "element", buffered: true });
  }

  disconnect() {
    this.nativePerformanceObserver.disconnect();
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

    // There's a weird bug where we sometimes get a load of empty rects (all zero'd out)
    if (ContainerPerformanceObserver.isEmptyRect(entry.intersectionRect)) {
      return;
    }

    // TODO: We should look into better ways to combine rectangles or detect overlapping rectangles such as R-Tree or Quad Tree algorithms
    for (const rect of resolvedRootData.paintedRects) {
      if (ContainerPerformanceObserver.overlaps(entry.intersectionRect, rect)) {
        return;
      }
    }

    resolvedRootData.lastPaintedSubElement = entry.element;
    resolvedRootData.startTime = entry.renderTime;
    resolvedRootData.paintedRects?.add(entry.intersectionRect);
    // size won't be super accurate as it doesn't take into account overlaps
    resolvedRootData.size += incomingEntrySize;
    resolvedRootData.identifier ||= closestRoot.getAttribute("containertiming");
    resolvedRootData.firstRenderTime ||= entry.renderTime;

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

    const rFRT = resolvedData.firstRenderTime ?? Infinity;
    const rpFRT = resolvedParentData.firstRenderTime ?? Infinity;

    const rST = resolvedData.startTime ?? 0;
    const rpST = resolvedParentData.startTime ?? 0;

    // Check firstRenderTime, if there's a faster time we should promote it upwards
    if (rFRT < rpFRT) {
      resolvedParentData.firstRenderTime = resolvedData.firstRenderTime;
      containerRootUpdates.add(parentRoot);
    }

    // Check Visually Complete
    if (rST > rpST) {
      resolvedData.startTime = resolvedParentData.startTime;
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
      val.batchCoordData = null;
    });

    // Have any containers been updated?
    containerRootUpdates.clear();

    // Reset last resolved data state, we want to re-use coordinate and size if aggregated
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
        this.emitNewAreaPainted(entry as PerformanceElementTiming, closestRoot);
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
        const containerCandidate: any = {
          entryType: "container",
          name: "",
          startTime: resolvedRootData.startTime,
          identifier: resolvedRootData.identifier,
          duration: 0,
          firstRenderTime: resolvedRootData.firstRenderTime,
          size: resolvedRootData.size,
          lastPaintedSubElement: resolvedRootData.lastPaintedSubElement,
        };

        containerEntries.push(containerCandidate);

        if (this.debug) {
          const rects = lastResolvedData?.paintedRects;
          ContainerPerformanceObserver.paintDebugOverlay(rects);
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
