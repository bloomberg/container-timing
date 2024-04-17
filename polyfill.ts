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

interface PerformanceContainerTiming extends PerformanceElementTiming {}
type ResolvedRootData = PerformanceContainerTiming;

// We need to set the element timing attribute tag on all elements below "containertiming" before we can start observing
// Otherwise no elements will be observed
const INTERNAL_ATTR_NAME = "POLYFILL-ELEMENTTIMING";
const containerTimingAttrSelector = "[containertiming]";
const nativePerformanceObserver = window.PerformanceObserver;
// containerRoots needs to be set before "observe" has initiated due to the fact new elements could have been injected earlier
const containerRoots = new Set<Element>();
const containerRootDataMap = new Map<Element, PerformanceContainerTiming>();

/**
 * @param {MutationList} mutationList
 * @param {MutationObserver} observer
 */
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
  static supportedEntryTypes = nativePerformanceObserver.supportedEntryTypes;

  constructor(callback: PerformanceObserverCallback) {
    this.nativePerformanceObserver = new nativePerformanceObserver(
      this.callbackWrapper.bind(this),
    );
    this.callback = callback;
    // If this polyfill is being used we can assume we're actively overriding PerformanceObserver
    this.override = true;
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

    // Have any containers been updated? keep track
    const containerRootUpdates = new Set<Element>();

    // Calculate the smallest rectangle that contains a union of all nodes which were painted in this container
    // Keep track of the smallest/largest painted rectangles as we go through them in filterEnt
    // TODO: This data needs to be moved under container scope as this wouldn't work if we had multiple containers
    let minX = Number.MAX_SAFE_INTEGER;
    let minY = Number.MAX_SAFE_INTEGER;
    let maxX = Number.MIN_SAFE_INTEGER;
    let maxY = Number.MIN_SAFE_INTEGER;

    // Strip elements from the final list that we've added via the polyfill as not to pollute the final set of results.
    const filterEntries = (entry: PerformanceEntry) => {
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
        minX = Math.min(minX, entryElmTiming.intersectionRect.left);
        minY = Math.min(minY, entryElmTiming.intersectionRect.top);
        maxX = Math.max(maxX, entryElmTiming.intersectionRect.right);
        maxY = Math.max(maxY, entryElmTiming.intersectionRect.bottom);
        const width = maxX - minX;
        const height = maxY - minY;
        const resolvedRootData: any = {};

        // This is an elementtiming we added rather than one which was there initially, remove it and grab the data
        resolvedRootData.name = entryElmTiming.name;
        resolvedRootData.url = entryElmTiming.url;
        resolvedRootData.renderTime = entryElmTiming.renderTime;
        resolvedRootData.lastPaintedSubElement = entryElmTiming.element;
        resolvedRootData.startTime ??= entryElmTiming.startTime;
        resolvedRootData.intersectionRect = new DOMRectReadOnly(
          minX,
          minY,
          width,
          height,
        );
        resolvedRootData.size = width * height;
        containerRootDataMap.set(closestRoot, resolvedRootData);

        // Because we've updated a container we should mark it as updated so we can return it with the list
        containerRootUpdates.add(closestRoot);

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
        });

        if (this.debug) {
          const div = document.createElement("div");
          div.style.backgroundColor = "#00800078";
          div.style.width = `${resolvedRootData.intersectionRect.width}px`;
          div.style.height = `${resolvedRootData.intersectionRect.height}px`;
          div.style.top = `${resolvedRootData.intersectionRect.top}px`;
          div.style.left = `${resolvedRootData.intersectionRect.left}px`;
          div.style.position = "fixed";
          div.style.transition = "background-color 1s";
          document.body.appendChild(div);
          setTimeout(() => {
            div.style.backgroundColor = "transparent";
          }, 1000);
          setTimeout(() => {
            div.remove();
          }, 2000);
        }
      });

      // if in debug mode, show the painted rectangle

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
      getEntriesByName: (name: string, type?: string) => {
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
