# Element Timing For Containers Polyfill

This polyfill allows developers to support element timing on containers (like `div`s or `section`s). This will fill a limitation which element-timing is [currently unable](https://github.com/WICG/element-timing/issues/79) to do. If you're working on a component and need better heuristics of when that component has been painted you can tag it with attributes and receive events similar to [`element-timing`](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceElementTiming).

## How to use

This polyfill should be loaded in the head or as early as possible so it can annotate elements needed for timing when the observer runs. At the very latest it should be loaded before you make the call to initiate the observer.

Add this polyfill to the top your page then use the `PerformanceObserver` to mark entries. From this point you can use the `PerformanceObserver` as you normally would. This polyfill will intercept calls from the observer and include any containers you wish to keep track off. You will also need to mark containers you're interested in tracking with the `elementtiming` attribute, just like you would on individual elements. See the example below:

**Markup**

```html
<div elementtiming>...some content</div>
```

**JS**

```js
const myObserver = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(entry);
    /**
      "duration": 0,
      "element": {},
      "entryType": "container-element",
      "id": "",
      "identifier": "",
      "percentagePainted": 0.88,
      "lastPaintedSubElement": div.cell,
      "url": ''
    **/
  });
});

observer.observe();
```

The difference between a container-element entry is:

1. It's entryType is "container-element"
2. It holds a "lastPaintedSubElement" field to show which inner element caused the most recent paint event.

## Examples

You can open the HTML of each example and look in the dev tools console to see what the event looks like.

## FAQs

### Should the user know how much has painted?

When we get paint events for a container its difficult to know if its fully rendered or not. In our polyfill we will fire multiple times for each new paint happening in a container. Just like LCP developers can choose the most recent candidate as their paint time.

That being said, this polyfill does provide a "lastPaintedElement" field which lets developers track which element caused the last paint update.

### Should we stop observing on interaction?

Due to the nature of containers having multiple events (unlike single element), we may want to stop observing once there's interaction so we have the concept of a "final candidate". This would let developers know the renderTime of the last paint after the page has loaded.

### Should this polyfill support additional elements?

There will be new performance entries when there's DOM mutation happening within a container, such as addition of new children. The observer currently fires new entries when this happens if they have caused new paint events.
