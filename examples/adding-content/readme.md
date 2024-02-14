## Adding Content

This example shows how the polyfill would work when dynamically adding nodes to a component after it has rendered.

Here the Element Timing event fires twice, we can see which element updated the container in each instance.

```js
{
    "duration": 0,
    "element": {},
    "entryType": "container-element",
    "renderTime": 49.5,
    "url": "",
    "name": "text-paint",
    "lastPaintedSubElement": h2
}
```

```js
{
    "duration": 0,
    "element": {},
    "entryType": "container-element",
    "renderTime": 5046.199999988079,
    "url": "",
    "name": "text-paint",
    "lastPaintedSubElement": p
}
```
