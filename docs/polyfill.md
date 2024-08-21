## Container Timing: Polyfill

This polyfill should be loaded in the head or as early as possible so it can annotate elements needed for timing when the observer runs. At the very latest it should be loaded before you make the call to initiate the observer.

Once added to the top of your page you can then use the `ContainerPerformanceObserver` to mark entries. The `ContainerPerformanceObserver` behaves very similarly to the `PerformanceObserver` but is only useful for this specific metric. You will also need to mark containers you're interested in tracking with the `containertiming` attribute (See [update below](#update-22022024)), just like you would on individual elements. See the example below:

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

You have the ability to nest containers within one another, entries for each container will still be emitted, for filtering on the container you're interested in its best to use an identifier when setting the attribute, such as `containertiming="myContainer"`.

There are various strategies for how we deal with nested containers, ignoring by default.

### `ignore`

This will treat both containers in isolation and won't pass up any entry information from one container to a parent. Anything which happens to a sub-container is ignored by the parent.
This can be useful if the inner container is unrelated to your content and you don't want to track any rendering behavior from it at all.

### `transparent`

This is similar to ignore above, but will still account for any changes happening in the inner-container, as though the boundary never existed in the first place. From the perspective the inner-container attribute has no effect.
The inner container will continue to receive its events like normal

## Debug Mode

You can set a global `ctDebug` flag to true in order to see paint rectangles from the collection of paints when a container has updated.
(set `window.ctDebug` or `globalThis.ctDebug` to true)

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
