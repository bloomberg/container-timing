# Container Timing Polyfill

This polyfill allows developers to support element timing on containers (like `div`s or `section`s). This will fill a limitation which element-timing is [currently unable](https://github.com/WICG/element-timing/issues/79) to do. If you're working on a component and need better heuristics of when that component has been painted you can tag it with attributes and receive events similar to [`element-timing`](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceElementTiming).

## How to use

This polyfill should be loaded in the head or as early as possible so it can annotate elements needed for timing when the observer runs. At the very latest it should be loaded before you make the call to initiate the observer.

Add this polyfill to the top your page and use the `ContainerPerformanceObserver` to mark entries. This API loosely follows the [PerformanceObserver](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver) interface. You will also need to mark containers you're interested in tracking with the `containertiming` attribute. See the example below:

**Markup**

```html
<div containertiming>...some content</div>
```

**JS**

```js
const myObserver = new ContainerPerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(entry);
    /**
      "duration": 0,
      "element": {},
      "entryType": "container-element",
      "id": "",
      "identifier": "something",
      "percentagePainted": 0.88,
      "numDescendantsPainted": 137,
      "numDescendants": 125,
      "renderTime": 77.0832,
      "url": ''
    **/
  });
});

observer.observe();
```

## Adding hints to the observer

The polyfill won't know the difference between an element that is for decoration and an element that may hold text in future, you can help mark elements which should hold content with an elementtiming attribute. This hint that we're expect content to load inside this div. For example

```html
<section containertiming>
  <div>some text content</div>
  <div></div>
  <!-- The second div will have content loaded in via ajax -->
</section>
```

As far as the containertiming polyfill is concerned, this section is fully painted (because it doesn't know about teh second div). However you can add this instead.

```html
<section containertiming>
  <div>some text content</div>
  <div elementtiming></div>
  <!-- The second div will have content loaded in via ajax -->
</section>
```

Now we will won't get a 100% painted until that div is content rendered. For a real-world example see [The Placeholder Problem](./examples/tables/readme.md#the-placeholder-problem)

## TODO - Handle mutation observer for new incoming changes below a container

root
