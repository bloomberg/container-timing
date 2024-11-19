## Container Timing: Polyfill

This polyfill simulates Container Timing in your browser, it relies heavily on element-timing internally which means as of this writing it only works on Chromium-based browsers.

This will need to be loaded in the head or as early as possible so that it can override the built-in PerformanceObserver and mark elements needing to be timed (those underneath a `containertiming` attribute).

Once added, you can mark containers you're interested in with the `containertiming` attribute and use the `container` entryType in the PerformanceObserver. You can also see the examples folder for an idea on how to use the polyfill.

## Setup

Right now this polyfill is not on npm, so you will need to build and run locally. Go to the polyfill directory then run these steps:

- `npm i`
- `npm run build`
- Open up one of the example html files
- Check the dev tools console

## Demo

![img](../docs/img/container-timing-demo.gif)

**Markup**

```html
<div containertiming>...some content</div>
```

**JS**

```js
const myObserver = new ContainerPerformanceObserver(
  (list) => {
    list.getEntries().forEach((entry) => {
      console.log(entry);
      /**
      {
          "entryType": "container",
          "name": "",
          "startTime": 5047.300000000745,
          "identifier": "wrapper",
          "duration": 0,
          "firstRenderTime": 46.90000000037253,
          "size": 216408.45314746455,
          "lastPaintedSubElement": {}
      }
    **/
    });
  },
  "newAreaPainted" | "aggregatedPaints" | "shadowed",
); // "aggregatedPaints by default"

observer.observe();
```

## Entry Interface

See [Explainer Interface](../readme.md#performancecontainertiming)

## Examples

You can open the HTML of each example and look in the dev tools console to see what the event looks like.

- [Table Example](./examples/table/table.html)
- [DOM Updates Example](./examples/adding-content/index.html)
- [Shadow DOM](./examples/shadow-dom/index.html)
- [SVG](./examples/svg/index.html)

## Nested Containers

Right now there's no way to set the nesting strategy, the polyfill is currently set to `ignore` by default.
For more info on nested containers, see [Nested Containers](../README.md#nested-container-roots)

## Debug Mode

You can set a global `ctDebug` flag to true in order to see paint rectangles from the collection of paints when a container has updated. This will work only when using the polyfill and not the native implementation.
(set `window.ctDebug` or `globalThis.ctDebug` to true).

Debug mode will not only show the rect overlays but it will also expose a `damagedRects` property on the `PerformanceContainerTimingDebug` class.

An example:

```js
const nativeObserver = new PerformanceObserver((v) => {
  const entries = v.getEntries();
  entries.forEach((entry) => {
    const rects = entry?.damagedRects;
    ContainerPerformanceObserver.paintDebugOverlay(rects);
  });
});
```

## Performance Impact of a native implementation

See [Performance Impact](./performance-impact.md)

## FAQs

### Why can't we just use the `elementtiming` attribute on containers like divs?

Due to some applications rendering containers before the contents within that container, its impossible to know the difference between a single element and a container holding no elements when this plugin starts. We tried using `[elementtiming]:has(*)` but because some applications start with their containers empty e.g:

```html
<div class="container" elementtiming>
  <!-- Some stuff will be injected here -->
</div>
```

The polyfill won't be able to identify these. So instead we opted to have a separate attribute to aid in finding containers; `containertiming`.
