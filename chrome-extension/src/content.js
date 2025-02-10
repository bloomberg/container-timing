import { showRectsOnScreen, showBoundingRect, clearRects, clearRectsWithDelay } from '../../demo-overlays/demo-overlays.js'
// Don't re-run operation after selector has been seen
let flag = false;
// Default selector
let selector = 'html';
// Container Timing element we've found
let elm;

// Pull the selector out of the settings
chrome.storage.sync.get(
  { selector: 'html' },
  (items) => {
    selector = items.selector || 'html';
  }
);

function maybeStartPerformanceObserve() {
  if ((elm = document.querySelector(selector)) && !flag) {
    startPerformanceObserve(elm);
  }
}
const observer = new MutationObserver(maybeStartPerformanceObserve);
maybeStartPerformanceObserve();
observer.observe(document.documentElement, { attributes: false, childList: true, characterData: false, subtree: true });

function startPerformanceObserve(elm) {
  const href = document.location.href
  const nativeObserver = new PerformanceObserver((list) => {
    console.log("Container timing entries from " + href)
    clearRects();
    list.getEntries().forEach((list) => {
      if (list?.damagedRects) {
        showRectsOnScreen(list.damagedRects);
      }
      showBoundingRect(list.intersectionRect);
      clearRectsWithDelay(5000);
    })
    // Now hide the rects so they're not in the way

  });
  nativeObserver.observe({ type: "container", buffered: true });
  console.debug("Registered observer for " + href)

  elm.setAttribute("containertiming", "")
  console.debug("Added containertiming attribute")
  flag = true;
}

