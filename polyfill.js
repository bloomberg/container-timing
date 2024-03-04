// We need to set the element timing attribute tag on all elements below "containertiming" before we can start observing
// Otherwise no elements will be observed
const INTERNAL_ATTR_NAME = "POLYFILL-ELEMENTTIMING";
const containerTimingAttrSelector = "[containertiming]";
const nativePerformanceObserver = window.PerformanceObserver;
// containerRoots needs to be set before "observe" has initiated due to the fact new elements could have been injected earlier
const containerRoots = new Map();

/**
 * @param {MutationList} mutationList
 * @param {MutationObserver} observer
 */
const mutationObserverCallback = (mutationList) => {
  const findContainers = (parentNode) => {
    // We've found a container
    if (parentNode.matches && parentNode.matches(containerTimingAttrSelector)) {
      ContainerPerformanceObserver.setDescendants(parentNode);
      containerRoots.set(parentNode, {});
      // we don't support nested containers right now so don't bother looking for more containers
      // TODO: How would this work if we have nested containers?
      return;
    }

    // A node was injected into the DOM with children navigate through the children to find a container
    if (parentNode.childNodes) {
      [...parentNode.childNodes].forEach(findContainers);
    }
  };

  for (const mutation of mutationList) {
    if (mutation.type === "childList" && mutation.addedNodes.length) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 3) {
          continue;
        }

        // Theres a chance the new sub-tree injected is a descendent of a container that was already in the DOM
        // Go through the container have currently and check..
        if (node.closest(containerTimingAttrSelector)) {
          // Set on the node itself
          ContainerPerformanceObserver.setElementTiming(node);
          // Set on the nodes children (if any)
          ContainerPerformanceObserver.setDescendants(node);
          continue;
        }

        // If there's no containers above, we should check for containers inside
        findContainers(node);
      }
    }
  }
};

// Wait until the DOM is ready then start collecting elements needed to be timed.
document.addEventListener("DOMContentLoaded", () => {
  const mutationObserver = new window.MutationObserver(
    mutationObserverCallback
  );

  const config = { attributes: false, childList: true, subtree: true };
  mutationObserver.observe(document, config);

  const elms = document.querySelectorAll(containerTimingAttrSelector);
  elms.forEach((elm) => {
    containerRoots.set(elm, {});
    ContainerPerformanceObserver.setDescendants(elm);
  });
});

/**
 * Container Performance Observer is a superset of Performance Observer which can augment element-timing to work on containers
 */
class ContainerPerformanceObserver {
  /** @type {PerformanceObserver} */
  nativePerformanceObserver;

  /** @type {(PerformanceObserverEntryList) => void} */
  callback;

  /** @type {boolean} */
  override;

  /** @type {boolean} */
  debug;

  constructor(callback) {
    this.nativePerformanceObserver = new nativePerformanceObserver(
      this.callbackWrapper.bind(this)
    );
    this.callback = callback;
    // If this polyfill is being used we can assume we're actively overriding PerformanceObserver
    this.override = true;
    this.debug = globalThis.ctDebug;
  }

  static walkDescendants(elm, callback) {
    /** @param {HTMLElement} */
    const walkChildren = ({ children }) => {
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

  static setElementTiming(el) {
    // We should keep track of elements which were already marked with element timing so we can still display those results
    // Sometimes DOM Nodes with the polyfilled-elementtiming are detached then re-attached to the DOM so check for these
    if (
      el.hasAttribute("elementtiming") &&
      el.attributes.getNamedItem("elementtiming").value !== INTERNAL_ATTR_NAME
    ) {
      el.setAttribute("initial-elementtiming-set", "true");
      return;
    }

    el.setAttribute("elementtiming", INTERNAL_ATTR_NAME);
  }

  /**
   * Recursively count the elements below the current node (ignoring containers or other element timing elements)
   * @param {HTMLElement} el
   */
  static setDescendants(el) {
    ContainerPerformanceObserver.walkDescendants(
      el,
      ContainerPerformanceObserver.setElementTiming
    );
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
  callbackWrapper(list) {
    // Check list for element timing entries, we don't care about other event type
    // Also if we're not actively observing element timing (override) don't bother augmenting
    if (
      this.override === false ||
      list.getEntriesByType("element").length === 0
    ) {
      this.callback(list);
      return;
    }

    // Have any containers been updated?
    const containerRootUpdates = new Set();
    // Calculate the smallest rectangle that contains a union of all nodes which were painted in this container
    // Keep track of the smallest/largest painted rectangles as we go through them in filterEnt
    let minX = Number.MAX_SAFE_INTEGER;
    let minY = Number.MAX_SAFE_INTEGER;
    let maxX = Number.MIN_SAFE_INTEGER;
    let maxY = Number.MIN_SAFE_INTEGER;

    const filterEntries = (entry) => {
      const element = entry.element;
      if (!element) {
        return false;
      }

      const closetRoot = element.closest(containerTimingAttrSelector);
      const resolvedRootData = containerRoots.get(closetRoot);
      if (element.getAttribute("elementtiming") === INTERNAL_ATTR_NAME) {
        minX = Math.min(minX, entry.intersectionRect.left);
        minY = Math.min(minY, entry.intersectionRect.top);
        maxX = Math.max(maxX, entry.intersectionRect.right);
        maxY = Math.max(maxY, entry.intersectionRect.bottom);
        const width = maxX - minX;
        const height = maxY - minY;

        // This is an elementtiming we added rather than one which was there initially, remove it and grab the data
        resolvedRootData.name = entry.name;
        resolvedRootData.url = entry.url;
        resolvedRootData.renderTime = entry.renderTime;
        resolvedRootData.lastPaintedSubElement = entry.element;
        resolvedRootData.startTime ??= entry.startTime;
        resolvedRootData.intersectionRect = {
          x: minX,
          y: minY,
          width: width,
          height: height,
          top: minY,
          right: maxX,
          bottom: maxY,
          left: minX,
        };
        resolvedRootData.size = width * height;

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
        const resolvedRootData = containerRoots.get(root);
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
