# Table Example

In this example we run container-timing against a table with many cells using divs.
The [without-elementtiming](./without-elementtiming.html) doesn't use `elementtiming` attributes for cells within a table and thus gets 100% or "1.00" when all the contentful elements have painted.
You can load this html in the browser and check devtools to see the results.

## The "placeholder" problem

The problem with the above example is that we inject content into these "cells" later on with a fetch, but the table has already been marked as 100% painted. The algorithm isn't going to know there is more content coming without us giving a hint. This is somewhat analogous to [`will-change`](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change) in the sense we are hinting to the browser that this element is expected to change and we should expect an update.

Running [with-elementtiming](./with-elementtiming.html) shows the same view, except this time we have marked the empty cells with the `elementtiming` attribute. When we get both results now we can see that our first result is 88% instead of 100%, our second result (when the column is populated) is 100%.

Entry 1:

```js
{
    "duration": 0,
    "element": {},
    "entryType": "container-element",
    "id": "",
    "identifier": "something",
    "percentagePainted": 0.88,
    "numDescendantsPainted": 137,
    "numDescendants": 155
}
```

Entry 2:

```js
{
    "duration": 0,
    "element": {},
    "entryType": "container-element",
    "id": "",
    "identifier": "something",
    "percentagePainted": 1,
    "numDescendantsPainted": 155,
    "numDescendants": 155
}
```
