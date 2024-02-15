// We need to set the element timing attribute tag on all elements below "containertiming" before we can start observing
// Otherwise no elements will be observed
const INTERNAL_ATTR_NAME = "POLYFILL-ELEMENTTIMING";
const containerTimingAttrSelector = "[elementtiming]:has(*)";
const nativePerformanceObserver = PerformanceObserver;

// Wait until the DOM is ready then start collecting elements needed to be timed.
document.addEventListener("DOMContentLoaded", () => {
  const elms = document.querySelectorAll(containerTimingAttrSelector);
  elms.forEach((elm) => {
    ContainerPerformanceObserver.setDescendants(elm);
  });
});

/**
 * Container Performance Observer is a superset of Performance Observer which can augment element-timing to work on containers
 */
class ContainerPerformanceObserver {
  /** @type {PerformanceObserver} */
  nativePerformanceObserver;

  /** @type {Map<HTMLElement, ResolvedRoot} */
  containerRoots;

  /** @type {(PerformanceObserverEntryList) => void} */
  callback;

  /** @type {MutationObserver} */
  mutationObserver;

  /** @type {boolean} */
  override;

  constructor(callback) {
    this.nativePerformanceObserver = new nativePerformanceObserver(
      this.callbackWrapper.bind(this)
    );
    this.callback = callback;
    this.containerRoots = new Map();
    this.mutationObserver = new MutationObserver(
      this.mutationObserverCallback.bind(this)
    );
    // If this polyfill is being used we can assume we're actively overriding PerformanceObserver
    this.override = true;
  }

  static walkDescendants(elm, callback) {
    /** @param {HTMLElement} */
    const walkChildren = ({ children }) => {
      const normalizedChildren = Array.from(children);
      normalizedChildren.forEach((child) => {
        // If the node has children its most likely a container and won't be tracked by elementtiming
        if (child.children.length) {
          walkChildren(child);
          return;
        }
        // we can filter out the same nodes elementtiming would
        callback(child);
      });
    };
    walkChildren(elm);
  }

  /**
   * Recursively count the elements below the current node (ignoring containers or other element timing elements)
   * @param {HTMLElement} el
   */
  static setDescendants(el) {
    ContainerPerformanceObserver.walkDescendants(el, (child) => {
      if (child.hasAttribute("elementtiming")) {
        // We should keep track of elements which were already marked with element timing so we can still display those results
        child.setAttribute("initial-elementtiming-set", "true");
        return;
      }

      child.setAttribute("elementtiming", INTERNAL_ATTR_NAME);
    });
  }

  observe(options) {
    // If we're not observing element timing we should just "pass through" to the normal PerformanceObserver
    if (
      options.type !== "element" &&
      !options?.entryTypes?.includes("element")
    ) {
      this.override = false;
      this.nativePerformanceObserver.observe(options);
      return;
    }

    // Locate container nodes which have "elementtiming" set
    this.findAndSetRoots();

    this.nativePerformanceObserver.observe(options);

    // Options for the observer (which mutations to observe)
    const config = { attributes: false, childList: true, subtree: true };
    this.containerRoots.forEach((_, rootElm) => {
      this.mutationObserver.observe(rootElm, config);
    });
  }

  findAndSetRoots() {
    const containerRoots = document.querySelectorAll(
      containerTimingAttrSelector
    );

    containerRoots.forEach((child) => {
      this.containerRoots.set(child, {});
    });
  }

  /**
   *
   * @param {MutationList} mutationList
   * @param {MutationObserver} observer
   */
  mutationObserverCallback(mutationList, observer) {
    for (const mutation of mutationList) {
      if (mutation.type === "childList" && mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 3) {
            continue;
          }
          node.setAttribute("elementtiming", INTERNAL_ATTR_NAME);
          // get parent
          const closestRoot = mutation.target.closest(
            containerTimingAttrSelector
          );
          const rootData = this.containerRoots.get(closestRoot);
          rootData.descendants++;
        }
      }
    }
  }

  /**
   * This will wrap the callback and add extra fields for container elements
   * @param {PerformanceObserverEntryList} list
   */
  callbackWrapper(list) {
    // Have any containers been updated?
    const containerRootUpdates = new Set();
    // Check list for element timing entries, we don't care about other event type
    // Also if we're not actively observing element timing (override) don't bother augmenting
    if (
      this.override === false ||
      list.getEntriesByType("element").length === 0
    ) {
      this.callback(list);
      return;
    }

    const filterEntries = (entry) => {
      const element = entry.element;
      const closetRoot = element.closest(containerTimingAttrSelector);
      const resolvedRootData = this.containerRoots.get(closetRoot);
      if (
        resolvedRootData &&
        element.getAttribute("elementtiming") === INTERNAL_ATTR_NAME
      ) {
        // This is an elementtiming we added rather than one which was there initially, remove it and grab the data
        resolvedRootData.name = entry.name;
        resolvedRootData.url = entry.url;
        resolvedRootData.renderTime = entry.renderTime;
        resolvedRootData.lastPaintedSubElement = entry.element;
        resolvedRootData.startTime ??= entry.startTime;

        // Because we've updated a container we should mark it as updated so we can return it with the list
        containerRootUpdates.add(closetRoot);

        // If elementtiming was explicitly set, we should preserve this entry as the developer wanted this information
        if (element.getAttribute("initial-elementtiming-set")) {
          return true;
        }

        return false;
      }

      return true;
    };

    const concatContainersIfNeeded = () => {
      const containerEntries = [];
      // If any of these updates happened in a container, add the container to the end of the list
      containerRootUpdates.forEach((root) => {
        const resolvedRootData = this.containerRoots.get(root);
        containerEntries.push({
          duration: 0,
          naturalHeight: 0,
          naturalWidth: 0,
          intersectionRect: null,
          element: root,
          entryType: "container-element",
          renderTime: resolvedRootData.renderTime,
          url: resolvedRootData.url,
          name: resolvedRootData.name,
          identifier: root.getAttribute("elementtiming"),
          lastPaintedSubElement: resolvedRootData.lastPaintedSubElement,
          startTime: resolvedRootData.startTime,
        });
      });

      return containerEntries;
    };

    const syntheticList = {
      getEntriesByType: (type) => {
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
      getEntriesByName: (name) => {
        return list
          .getEntriesByName(name)
          .filter(filterEntries)
          .concat(concatContainersIfNeeded());
      },
    };

    this.callback(syntheticList);
  }
}

window.PerformanceObserver = ContainerPerformanceObserver;
