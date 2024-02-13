## Adding Content

This example shows how the polyfill would work when dynamically adding content to a component after it has rendered.
Here the Container Timing event fires twice, both times we have percentagePainted at 100% due to the fact that all the contentful elements were painted the first time, then when the dynamically content was injected it was all also fully painted, however you can see that number of descendants have changed in the second object.

```js
{
    "duration": 0,
    "element": {},
    "entryType": "container-element",
    "id": "",
    "identifier": "",
    "percentagePainted": 0.67,
    "numDescendantsPainted": 2,
    "numDescendants": 3,
    "renderTime": 49.8999999910593,
    "url": "",
    "name": "text-paint"
}
```

```js
{
    "duration": 0,
    "element": {},
    "entryType": "container-element",
    "id": "",
    "identifier": "",
    "percentagePainted": 1,
    "numDescendantsPainted": 4,
    "numDescendants": 4,
    "renderTime": 5085.0999999940395,
    "url": "",
    "name": "text-paint"
}
```
