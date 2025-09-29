// Enable verbose logs
window.ctDebug = true;

const observer = new PerformanceObserver((list) => {
  const entries = list.getEntries();
  entries.forEach((e) => {
    console.log(e);
  });
});
observer.observe({ type: "container", buffered: true });

const skeletonRoot = document.getElementById("skeleton");
const realRoot = document.getElementById("real");

function loadRealContent() {
  // Simulate loading dynamic content after 5 seconds
  const frag = document.createDocumentFragment();
  const wrapper = document.createElement("div");
  wrapper.className = "real fade-in";
  wrapper.innerHTML = `
    <img src="https://picsum.photos/320/240?grayscale" alt="Random scenic"/>
    <div>
      <h2>Loaded Article Title</h2>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vel arcu sed turpis pulvinar tristique. Donec fermentum.</p>
      <p>More body content appears here with <strong>mixed styles</strong>, inline <code>code</code>, and a link <a href="#">anchor</a>.</p>
    </div>
  `;
  frag.appendChild(wrapper);
  realRoot.appendChild(frag);
  realRoot.hidden = false;
  skeletonRoot.remove();
}

// Delay 5s then replace skeleton with real content
setTimeout(loadRealContent, 5000);
