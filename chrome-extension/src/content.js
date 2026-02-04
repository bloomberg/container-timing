import {
  showRectsOnScreen,
  showBoundingRect,
  clearRects,
  clearRectsWithDelay,
  showLCPRect,
  showLCPInfoBox,
  showContainerInfoBox,
} from "../../demo-overlays/demo-overlays.js";
// Don't re-run operation after selector has been seen
let flag = false;
// Default selector
let selector = "html";
// Container Timing element we've found
let elm;

// Pull the selector out of the settings
chrome.storage.sync.get({ selector: "html" }, (items) => {
  selector = items.selector || "html";
});

function maybeStartPerformanceObserve() {
  if ((elm = document.querySelector(selector)) && !flag) {
    startPerformanceObserve(elm);
  }
}
const observer = new MutationObserver(maybeStartPerformanceObserve);
maybeStartPerformanceObserve();
observer.observe(document.documentElement, {
  attributes: false,
  childList: true,
  characterData: false,
  subtree: true,
});

// Draw's the LCP's entry rect using the element's bounding rect, stores the result and overwrites it when there's a new rect to draw
function drawLCPRect(entry) {
  console.log("LCP entry:", entry);
  const rect = entry.element.getBoundingClientRect();
  showLCPRect(rect);
  showLCPInfoBox(entry.renderTime);
}

function startPerformanceObserve(elm) {
  const href = document.location.href;
  const nativeObserver = new PerformanceObserver((list) => {
    clearRects();
    list.getEntries().forEach((entry) => {
      console.log("Container entry:", entry);
      if (entry?.damagedRects) {
        showRectsOnScreen(entry.damagedRects);
      }
      showBoundingRect(entry.intersectionRect);
      showContainerInfoBox(entry.startTime);
    });
    // Now hide the rects so they're not in the way
  });

  const lcpObserver = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      console.log(entry);
      drawLCPRect(entry);
    });
  });

  lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
  nativeObserver.observe({ type: "container", buffered: true });
  console.debug("Registered observer for " + href);

  elm.setAttribute("containertiming", "");
  console.debug("Added containertiming attribute");
  flag = true;
}
