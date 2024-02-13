// We need to set the element timing attribute tag on all elements below "containertiming" before we can start observing
// Otherwise no elements will be observed
const INTERNAL_ATTR_NAME = "POLYFILL-ELEMENTTIMING";
const containerTimingAttrSelector = "[elementtiming]:has(*)";

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
    this.nativePerformanceObserver = new PerformanceObserver(
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
      if (!children.length) return 0;
      const normalizedChildren = Array.from(children);
      normalizedChildren.forEach((child) => {
        // we can filter out the same nodes elementtiming would
        if (ContainerPerformanceObserver.shouldTrackNode(child)) {
          callback(child);
          return;
        }

        walkChildren(child);
      });
    };
    walkChildren(elm);
  }

  /**
   * This function tries to follow the same logic as the elementtiming algorithm
   * This will only track nodes which have text nodes and children or images
   * @param {HTMLElement} el
   */
  static shouldTrackNode(el) {
    // If the node has children its most likely a container and won't be tracked by elementtiming
    if (el.children.length) {
      return false;
    }

    // Images may need better heuristics than just the node name
    if (el.nodeName === "IMG") {
      return true;
    }

    if (el.hasChildNodes()) {
      const childNodes = Array.from(el.childNodes);
      // Probably dealing with a text node here
      if (childNodes.map((node) => node.nodeType === 3)) {
        return true;
      }
    }

    if (el.hasAttribute("elementtiming")) {
      return true;
    }
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

    // Start searching for element timing elements
    this.nativePerformanceObserver.observe({ type: "element", buffered: true });

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
          node.setAttribute("elementtiming", INTERNAL_ATTR_AME);
          // get parent
          const closestRoot = mutation.target.closest("[containertiming]");
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
          element: root,
          entryType: "container-element",
          renderTime: resolvedRootData.renderTime,
          url: resolvedRootData.url,
          name: resolvedRootData.name,
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
