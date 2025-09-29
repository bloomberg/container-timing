## Skeleton Layout Example

This example demonstrates a typical skeleton (placeholder) layout that is displayed while content loads, then replaced with full fidelity content after 5 seconds. It is intended to help validate that low-entropy placeholder blocks (solid shapes with minimal textual/visual information) are ignored by Container Timing / Container Element Timing until real content appears.

### Behavior

1. Initial paint: A card-like container (with `containertiming="article"`) renders shimmering gray blocks (image slot + text lines).
2. A `PerformanceObserver` listens for `container` entries.
3. After 5 seconds, real content (image + heading + paragraphs) replaces the skeleton.
4. New timing entries should show the container's update tied to the rich sub-elements (e.g., `<h2>`, `<p>`, `<img>`), not the initial low-entropy blocks.

### What To Look For

Open DevTools console and watch the logged entries. Before the swap, the implementation should:

- Not emit entries for the placeholder rectangles.

After real content appears you should see a clear `lastPaintedSubElement` referencing semantic content.

### Running

Open `index.html` in a browser (with the polyfill bundled) or serve the repo and visit:

```
/examples/skeleton-layout/index.html
```

### Tweaks

- Adjust the delay in `index.js` (currently 5000 ms) to simulate different loading times.
- Change the placeholder shapes / add variation to test entropy thresholds.
- Swap the `picsum.photos` image URL with a locally provided asset if offline testing is desired.
