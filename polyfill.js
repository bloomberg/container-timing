// We need to set the element timing attribute tag on all elements below "containertiming" before we can start observing
// Otherwise no elements will be observed
const NAME = "POLYFILL-ELEMENTTIMING";
const containerTimingAttrSelector = "[containertiming]";

// Wait until the DOM is ready then start collecting elements needed to be timed.
document.addEventListener("DOMContentLoaded", () => {
  const elms = document.querySelectorAll(containerTimingAttrSelector);
  elms.forEach((elm) => {
    ContainerPerformanceObserver.setDescendants(elm);
  });
});

class ContainerPerformanceObserver {
  nativePerformanceObserver;
  containerRoots;
  callback;
  mutationObserver;

  constructor(callback) {
    this.nativePerformanceObserver = new PerformanceObserver(
      this.callbackWrapper.bind(this)
    );
    this.callback = callback;
    this.containerRoots = new Map();
    this.mutationObserver = new MutationObserver(
      this.mutationObserverCallback.bind(this)
    );
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
   * Recursively count the elements below the current node (ignoring containers or other element timing elements)
   * @param {HTMLElement} el
   */
  static setDescendants(el) {
    ContainerPerformanceObserver.walkDescendants(el, (child) => {
      child.setAttribute("elementtiming", NAME);
    });
  }

  /**
   * Recursively count the elements below the current node (ignoring containers or other element timing elements)
   * @param {HTMLElement} el
   */
  static countDescendants(el) {
    let count = 0;
    ContainerPerformanceObserver.walkDescendants(el, (child) => {
      count++;
    });

    return count;
  }

  /**
   * This function tries to follow the same logic as the elementtiming algorithm
   * This will only track nodes which have textnodes and children or images
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

  findContainerTimingElements() {
    const containerRoots = document.querySelectorAll(
      containerTimingAttrSelector
    );
    containerRoots.forEach((child) => {
      const descendants = ContainerPerformanceObserver.countDescendants(child);
      this.containerRoots.set(child, {
        descendants,
        paintedChildren: 0,
        percentagePainted: 0,
      });
    });
  }

  observe() {
    this.findContainerTimingElements();
    // Start searching for element timing elements
    this.nativePerformanceObserver.observe({ type: "element", buffered: true });

    // Options for the observer (which mutations to observe)
    const config = { attributes: false, childList: true, subtree: true };
    this.containerRoots.forEach((_, rootElm) => {
      this.mutationObserver.observe(rootElm, config);
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
          node.setAttribute("elementtiming", NAME);
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
    // Check list for element timing entries, we don't care about other event type
    if (list.getEntriesByType("element").length === 0) {
      this.callback(list);
      return;
    }

    // At this point we should put the entries into their respective containers
    list.getEntriesByType("element").forEach((entry) => {
      const element = entry.element;
      const closetRoot = element.closest(containerTimingAttrSelector);
      const resolvedRoot = this.containerRoots.get(closetRoot);
      if (!resolvedRoot) {
        console.error("failed to find root");
        return;
      }
      resolvedRoot.name = entry.name;
      resolvedRoot.url = entry.url;
      resolvedRoot.renderTime = entry.renderTime;
      resolvedRoot.paintedChildren++;
      resolvedRoot.percentagePainted = parseFloat(
        (resolvedRoot.paintedChildren / resolvedRoot.descendants).toFixed(2)
      );
    });

    /** @type PerformanceEntry[] */
    let entries = [];
    for (const [key, val] of this.containerRoots.entries()) {
      entries.push({
        duration: 0,
        element: key,
        entryType: "container-element",
        id: key.id,
        identifier: key.getAttribute("containertiming"),
        percentagePainted: val.percentagePainted,
        numDescendantsPainted: val.paintedChildren,
        numDescendants: val.descendants,
        renderTime: val.renderTime,
        url: val.url,
        name: val.name,
      });
    }

    const syntheticList = {
      getEntries: () => entries,
    };
    this.callback(syntheticList);
  }
}
