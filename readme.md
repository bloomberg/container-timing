# Element Timing For Containers Polyfill

This polyfill allows developers to support element timing on containers (like `div`s or `section`s). This will fill a limitation which element-timing is [currently unable](https://github.com/WICG/element-timing/issues/79) to do. If you're working on a component and need better heuristics of when that component has been painted you can tag it with attributes and receive events similar to [`element-timing`](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceElementTiming).

## How to use

This polyfill should be loaded in the head or as early as possible so it can annotate elements needed for timing when the observer runs. At the very latest it should be loaded before you make the call to initiate the observer.

Add this polyfill to the top your page then use the `PerformanceObserver` to mark entries. From this point you can use the `PerformanceObserver` as you normally would. This polyfill will intercept calls from the observer and include any containers you wish to keep track off. You will also need to mark containers you're interested in tracking with the `containertiming` attribute (See [update below](#update-22022024)), just like you would on individual elements. See the example below:

**Markup**

```html
<div containertiming>...some content</div>
```

**JS**

```js
const myObserver = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(entry);
    /**
{
    "duration": 0,
    "naturalHeight": 0,
    "naturalWidth": 0,
    "intersectionRect": {
      "x": 10,
      "y": 10,
      "width": 2123.7501640319824,
      "height": 522.3333435058594,
      "top": 10,
      "right": 2133.7501640319824,
      "bottom": 532.3333435058594,
      "left": 10
    },
    "element": div.table,
    "entryType": "container-element",
    "renderTime": 45.5,
    "url": "",
    "name": "text-paint",
    "identifier": "",
    "lastPaintedSubElement": div.dynUpdate,
    "startTime": 45.5
}
    **/
  });
});

observer.observe();
```

The difference between a container-element entry is:

1. It's entryType is `container-element`
2. It holds a `lastPaintedSubElement` field to show which inner element caused the most recent paint event.

## Entry Interface

Entries are similar to the [interface](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceElementTiming) for element-timing:

- `duration` - Always returns 0 as duration does not apply to this interface.
- `entryType` - `container-element` for entries which happen on container elements
- `name` - Returns `image-paint` for images and text-paint` for text. This data will come from the most recent paint entry within this container.
- `naturalHeight` - Always returns 0 for now as this is for image elements
- `naturalWidth` - Always returns 0 for now as this is for image elements
- `intersectionRect` - The smallest rectangle covering the sub elements painted
- `size` - The size of the painted rectangle within this container returned as the area (width \* height).
- `startTime` - Returns the start time of the first paint within this container, once this value is set it does not change, even if there are subsequent entries later on.
- `element` - An Element representing the element we are returning information about.
- `id` - A string which is the `id` of the element
- `identifier` - A string which is the value of the elementtiming attribute on the element.
- `renderTime` - A DOMHighResTimeStamp with the renderTime of the sub element which had the most recent paint.
- `lastPaintedSubElement` - A reference to the sub element which had the most recent paint.

## Examples

You can open the HTML of each example and look in the dev tools console to see what the event looks like.

- [Table Example](./examples/table/table.html)
- [DOM Updates Example](./examples/adding-content/index.html)
- [Shadow DOM](./examples/shadow-dom/index.html)
- [SVG](./examples/svg/index.html)

## Debug Mode

You can set a global `ctDebug` flag to true in order to see paint rectangles from the collection of paints when a container has updated.
(set `window.ctDebug` or `globalThis.ctDebug` to true)

## Update 22/02/2024

Due to some applications loading containers before the contents within that container, its impossible to know the difference between a single element and a container holding elements when this plugin starts. Up until this point we've been using the selector `[elementtiming]:has(*)` but because some applications start with their containers empty e.g:

```html
<div class="container" elementtiming>
  <!-- Some stuff will go here -->
</div>
```

the polyfill won't be able to identify these. So instead it may make sense to have a separate attribute to aid in finding containers, for now I will call this `containertiming`. The developer can mark containers which should have timing with this attribute instead of `elementtiming`.

### Recursive iteration of new DOM elements is needed

If a subtree is injected into the DOM along with child elements, those child elements [won't be picked up](https://stackoverflow.com/questions/61314922/mutationobserver-not-picking-up-on-child-nodes) by the mutationObserver. This means we can miss out on new containers being injected if we don't recurse through each new entry.

In order to alleviate this issue we need to recourse through every child of every new DOM Node inserted.

## FAQs ### Should the user know how much has painted? When we get paint events

for a container its difficult to know if its fully rendered or not. In our
polyfill we will fire multiple times for each new paint happening in a
container. Just like LCP developers can choose the most recent candidate as
their paint time. That being said, this polyfill does provide a
"lastPaintedElement" field which lets developers track which element caused the
last paint update. ### Should we stop observing on interaction? Due to the
nature of containers having multiple events (unlike single element), we may want
to stop observing once there's interaction so we have the concept of a "final
candidate". This would let developers know the renderTime of the last paint
after the page has loaded. ### Should this polyfill support additional elements?
There will be new performance entries when there's DOM mutation happening within
a container, such as addition of new children. The observer currently fires new
entries when this happens if they have caused new paint events.

```

```
