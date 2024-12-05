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


const observer = new MutationObserver(() => {
  if ((elm = document.querySelector(selector)) && !flag) {
    startPerformanceObserve(elm)
  }
});

observer.observe(document.documentElement, { attributes: false, childList: true, characterData: false, subtree: true });

function startPerformanceObserve(elm) {
  const href = document.location.href
  const nativeObserver = new PerformanceObserver((list) => {
    console.log("Container timing entries from " + href)
    list.getEntries().forEach((list) => {
      clearRects();
      showRectsOnScreen(list.damagedRects);
      showBoundingRect(list.intersectionRect);
      clearRects(true)
    })
    // Now hide the rects so they're not in the way

  });
  nativeObserver.observe({ type: "container", buffered: true });
  console.debug("Registered observer for " + href)

  elm.setAttribute("containertiming", "")
  console.debug("Added containertiming attribute")
  flag = true;
}

function showRectsOnScreen(rects) {
  // TODO We may want to batch these DOM updates
  rects.forEach((rect) => {
    const div = document.createElement('div');
    div.classList.add('overlay');
    div.style.left = `${rect.left}px`;
    div.style.top = `${rect.top}px`;
    div.style.width = `${rect.width}px`;
    div.style.height = `${rect.height}px`;
    document.body.appendChild(div);
  });
}

function showBoundingRect(rect) {
  const div = document.createElement('div');
  div.classList.add('boundingRect');
  div.style.left = `${rect.left}px`;
  div.style.top = `${rect.top}px`;
  div.style.width = `${rect.width}px`;
  div.style.height = `${rect.height}px`;
  document.body.appendChild(div);
}

function clearRects(withDelay = false) {
  if (withDelay) {
    return setTimeout(() => {
      document.querySelectorAll('.overlay').forEach(elm => elm.remove());
      document.querySelectorAll('.boundingRect').forEach(elm => elm.remove());
    }, 5000);
  }

  document.querySelectorAll('.overlay').forEach(elm => elm.remove());
  document.querySelectorAll('.boundingRect').forEach(elm => elm.remove());
}
