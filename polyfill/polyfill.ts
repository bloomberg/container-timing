const native_implementation_available = "PerformanceContainerTiming" in window;

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

interface ResolvedRootData extends PerformanceContainerTiming {
  damagedRects: Set<DOMRectReadOnly>;
  intersectionRect: DOMRectReadOnly | null;
  /** For aggregated paints keep track of the union painted rect */
  coordData?: any;
}

type NestedStrategy = "ignore" | "transparent" | "shadowed";

// We need to set the element timing attribute tag on all elements below "containertiming" before we can start observing
// Otherwise no elements will be observed
const INTERNAL_ATTR_NAME = "POLYFILL-ELEMENTTIMING";
const containerTimingAttrSelector = "[containertiming]";
const containerTimingIgnoreSelector = "[containertiming-ignore]";
const NativePerformanceObserver = window.PerformanceObserver;
// containerRoots needs to be set before "observe" has initiated due to the fact new elements could have been injected earlier
const containerRoots = new Set<Element>();
const containerRootDataMap = new Map<Element, ResolvedRootData>();
// Keep track of containers that need updating (sub elements have painted), this is reset between observer callbacks
const containerRootUpdates = new Set<Element>();
// Keep track of processed elements
const observedElements = new WeakSet();
// Keep track of the last set of resolved data so it can be shown in debug mode
let lastResolvedData: Partial<{
  damagedRects: Set<DOMRectReadOnly>;
  intersectionRect: DOMRectReadOnly;
}>;

let mutationObserver;
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
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          !observedElements.has(node)
        ) {
          // At this point we can be certain we're dealing with an element
          const element = node as Element;

          // If the element is a descendent of an ignored container we should skip
          if (element.closest(containerTimingIgnoreSelector)) {
            continue;
          }

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

          // Mark the element as processed
          observedElements.add(node);
        }
      }
    }
  }
};

// Wait until the DOM is ready then start collecting elements needed to be timed.
if (!native_implementation_available) {
  console.debug("Enabling Container Timing polyfill");
  mutationObserver = new window.MutationObserver(mutationObserverCallback);

  const config = { attributes: false, childList: true, subtree: true };
  mutationObserver.observe(document.documentElement, config);
} else {
  console.debug("Native implementation of Container Timing available");
}

class PerformanceContainerTiming implements PerformanceEntry {
  entryType = "container";
  name = "";
  duration = 0;
  startTime: number;
  identifier: string | null;
  firstRenderTime: number;
  size: number;
  lastPaintedElement: Element | null;

  constructor(
    startTime: number,
    identifier: string | null,
    size: number,
    firstRenderTime: number,
    lastPaintedElement: Element | null,
    _: Set<DOMRectReadOnly> | undefined,
  ) {
    this.identifier = identifier;
    this.size = size;
    this.startTime = startTime;
    this.firstRenderTime = firstRenderTime;
    this.lastPaintedElement = lastPaintedElement;
  }

  toJSON(): void {}
}

// The debug version of PerformanceContainerTiming, this will give some more detail
class PerformanceContainerTimingDebug extends PerformanceContainerTiming {
  damagedRects: Set<DOMRectReadOnly> | undefined;
  intersectionRect: DOMRectReadOnly;

  constructor(
    startTime: number,
    identifier: string | null,
    size: number,
    firstRenderTime: number,
    lastPaintedElement: Element | null,
    damagedRects: Set<DOMRectReadOnly> | undefined,
    intersectionRect: DOMRectReadOnly,
  ) {
    super(
      startTime,
      identifier,
      size,
      firstRenderTime,
      lastPaintedElement,
      damagedRects,
    );

    this.identifier = identifier;
    this.size = size;
    this.startTime = startTime;
    this.firstRenderTime = firstRenderTime;
    this.lastPaintedElement = lastPaintedElement;
    this.damagedRects = damagedRects;
    this.intersectionRect = intersectionRect;
  }
}

/**
 * Container Performance Observer is a superset of Performance Observer which can augment element-timing to work on containers
 */
class ContainerPerformanceObserver implements PerformanceObserver {
  nativePerformanceObserver: PerformanceObserver;
  // Debug flag to include extra data
  debug: boolean;
  // We need to know if element timing has been explicitly set or not
  overrideElementTiming: boolean = false;
  // is container timing being used or should we just passthrough to the native polyfill
  polyfillEnabled: boolean = false;
  // We need to keep track of set entryTypes so we know whether to ignore element timing
  entryTypes: string[] = [];
  callback: PerformanceObserverCallback;

  static supportedEntryTypes = NativePerformanceObserver.supportedEntryTypes;

  constructor(callback: PerformanceObserverCallback) {
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
        // If we see a containertiming-ignore we should stop traversing
        if (child.matches && child.matches(containerTimingIgnoreSelector)) {
          return;
        }

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
      damagedRects: new Set(),
      intersectionRect: null,
      identifier: "",
      size: 0,
      startTime: 0,
      firstRenderTime: 0,
      lastPaintedElement: null,
      toJSON: () => {},
    };

    return resolvedRootData;
  }

  takeRecords(): PerformanceEntryList {
    const list = this.nativePerformanceObserver.takeRecords();

    // Don't expose element timing records if the user didn't ask for them
    if (this.overrideElementTiming) {
      return list.filter((entry) => entry.entryType !== "element");
    }

    return list;
  }

  observe(
    options?: PerformanceObserverInit,
  ) {
    const hasOption = (name: string, options?: PerformanceObserverInit) =>
      options?.entryTypes?.includes(name) || options?.type === name;

    if (hasOption("container", options)) {
      this.polyfillEnabled = true;
      let resolvedTypes = options?.type
        ? [options?.type]
        : options?.entryTypes ?? [];

      // Remove "container" before passing down into PerfObserver
      resolvedTypes = resolvedTypes.filter((type) => type !== "container");

      if (!hasOption("element", options)) {
        this.overrideElementTiming = true;
        resolvedTypes = resolvedTypes.concat("element");
      }

      this.entryTypes = resolvedTypes;
      // If we only have 1 type its preferred to use the type property, otherwise use entryTypes
      // This is to make sure buffered still works when we only have "element" set.
      this.nativePerformanceObserver.observe({
        type: resolvedTypes.length === 1 ? resolvedTypes[0] : undefined,
        entryTypes: resolvedTypes.length > 1 ? resolvedTypes : undefined,
        buffered: resolvedTypes.length === 1 ? true : undefined,
      });
      return;
    }

    // We're just using the observer as normal
    this.nativePerformanceObserver.observe(options);
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
    // https://issues.chromium.org/issues/379844652
    // https://github.com/bloomberg/container-timing/issues/8
    // The other reason this can happen is if an element renders "off screen", which is expected behavior (test case: https://fluoridated-bow-church.glitch.me/)
    if (ContainerPerformanceObserver.isEmptyRect(entry.intersectionRect)) {
      return;
    }

    // TODO: We should look into better ways to combine rectangles or detect overlapping rectangles such as R-Tree or Quad Tree algorithms
    for (const rect of resolvedRootData.damagedRects) {
      if (ContainerPerformanceObserver.overlaps(entry.intersectionRect, rect)) {
        return;
      }
    }

    resolvedRootData.lastPaintedElement = entry.element;
    resolvedRootData.startTime = entry.startTime; // For images this will either be the load time or render time
    resolvedRootData.damagedRects?.add(entry.intersectionRect);
    // intersectionRect should default to the first entry's intersectionRect then build from where onwards
    if (resolvedRootData.intersectionRect) {
      resolvedRootData.intersectionRect = ContainerPerformanceObserver.extend(
        resolvedRootData.intersectionRect,
        entry.intersectionRect,
      );
    } else {
      resolvedRootData.intersectionRect = entry.intersectionRect;
    }

    // size won't be super accurate as it doesn't take into account overlaps
    resolvedRootData.size += incomingEntrySize;
    resolvedRootData.identifier ||= closestRoot.getAttribute("containertiming");
    resolvedRootData.firstRenderTime ||= entry.renderTime;

    // Update States
    containerRootDataMap.set(closestRoot, resolvedRootData);
    containerRootUpdates.add(closestRoot);
    lastResolvedData.damagedRects?.add(entry.intersectionRect);

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

  // This is used for merging DOMRectReadOnly's together into a bigger rect
  static extend(
    rectA: DOMRectReadOnly,
    rectB: DOMRectReadOnly,
  ): DOMRectReadOnly {
    const left = Math.min(rectA.left, rectB.left);
    const top = Math.min(rectA.top, rectB.top);
    const right = Math.max(rectA.right, rectB.right);
    const bottom = Math.max(rectA.bottom, rectB.bottom);

    const result = {
      left,
      top,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      right,
      bottom,
      toJSON: () => this,
    };

    return result;
  }

  static isEmptyRect(rect: DOMRectReadOnly): boolean {
    return rect.width === 0 && rect.height === 0;
  }

  static size(rect: { width: number; height: number }): number {
    return rect.width * rect.height;
  }

  // This polyfill uses element timing, but we don't leak that back to the user unless intended
  filterEntryList(list: PerformanceEntryList): PerformanceEntryList {
    if (this.overrideElementTiming) {
      return list.filter((entry) => entry.entryType !== "element");
    } else {
      return list;
    }
  }

  /**
   * This will wrap the callback and add extra fields for container elements
   * @param {PerformanceObserverEntryList} list
   */
  callbackWrapper(list: PerformanceObserverEntryList) {
    // Use this to keep track of container updates, clear it after each paint batch
    containerRootUpdates.clear();

    // Reset last resolved data state, we want to re-use coordinate and size if aggregated
    lastResolvedData = { damagedRects: new Set() };

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
        // We should check the element is directly a `containertiming` element or
        // its one of our own `elementtiming` elements which we polyfilled
        // The former is because you can apply `containertiming` to a <p> and it should still work
        (element.getAttribute("elementtiming") === INTERNAL_ATTR_NAME ||
          element.hasAttribute("containertiming")) &&
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

        const PerfContainerTimingClass = this.debug
          ? PerformanceContainerTimingDebug
          : PerformanceContainerTiming;
        const containerCandidate: any = new PerfContainerTimingClass(
          resolvedRootData.startTime,
          resolvedRootData.identifier,
          resolvedRootData.size,
          resolvedRootData.firstRenderTime,
          resolvedRootData.lastPaintedElement,
          resolvedRootData.damagedRects,
          resolvedRootData.intersectionRect ?? new DOMRectReadOnly(),
        );

        containerEntries.push(containerCandidate);
      });

      return containerEntries;
    };

    list.getEntries().forEach(processEntries);
    const containers = fetchUpdatedContainers();

    const syntheticList: PerformanceObserverEntryList = {
      getEntries: () => {
        const defaultEntries = this.filterEntryList(list.getEntries());
        return defaultEntries.concat(containers);
      },
      getEntriesByName: (name, type) => {
        const defaultEntries = this.filterEntryList(
          list.getEntriesByName(name, type),
        );
        if (type === "container") {
          defaultEntries.concat(containers);
        }

        return defaultEntries;
      },
      getEntriesByType: (type) => {
        const defaultEntries = this.filterEntryList(
          list.getEntriesByType(type),
        );
        if (type === "container") {
          defaultEntries.concat(containers);
        }

        return defaultEntries;
      },
    };

    this.callback(syntheticList, this);
  }
}

if (!native_implementation_available) {
  window.PerformanceObserver = ContainerPerformanceObserver;
}
