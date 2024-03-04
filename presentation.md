### Slide 1:

Hi, I'm Jason Williams from Bloomberg, Andy Davies from speedcurve is also here and we're going to revisit the discussion on element timing.
We discussed this back in early december, but I appreciate not everyone was here then, so ill give a quick recap, go through the polyfill, then open up for questions and continued discussion.

### Slide 2:

We talked about how element timing only supports a small set of elements in its current state and we weren't happy about this.

### Slide 3:

More and more of the web is becoming component based in how its constructed and thought about and performance is no different.
Developers want to know when a widget, or a component, or a sub-section of the DOM has been painted.

### Slide 4:

Even composite elements like SVG, Math and Table have this problem and are not candidates for element timing due to their nature.

### Slide 5:

This problem extends to to Largest Contentful Paint, as that uses element-timing internally to find candidates. Our table component below is not in a state to be considered, so our largest contentful paint is the title in the top right corner. This a problem for Bloomberg because it reports LCP as when this view is ready, which is misleading.

### Slide 9:

This polyfill loads does a couple of things:

- It will identify elementtiming elements which are containers (i'll call these containerRoots). Once they're found it will attach element timing to all the relevant child nodes inside, so you can imagine we build up this tree of container Roots and its children being timed.
- It will then replace the PerformanceObserver with itself
- If it picks up elementtiming events from elements inside a container root it will fire a new PerformanceEntry for that container root.
- if changes happen within a container root there will be a new PerformanceEntry, this is different to previous element timing entries

### Slide 10:

When receiving an entry this is what you'll get, the overall interface matches up with an entry you would recieve from an element-timing callback but I've highlighted some differences where things may need to change:

- `entryType` shows "container-element" instead of "element" just to differentiate between the two, there's no reason why this couldn't be element but it developers may want to know when a container/component has painted and may gate on this.
- `startTime..` Due to the nature of multiple entries firing for the same element the startTime here resembles the first paint time, once this value is set it won't change
- `renderTime` represents the "current" renderTime, this would allow you to differentiate between the startTime and the most recent render time.
- `lastPaintedSubElement` - this is a reference to the most recently painted element within the container that triggered paint. There may be more than one in reality but this will only point to the last one. This may be useful if developers need to debug why a container painted late or why paint was triggered at all.

### Slide 11:

Open Question number 1:

- Should we include size? Largest Contentful Paint has "size", if we were to include this we would need to call `getClientBoundingRects()` or some similar API and this will trigger style and layout. How much of a problem in real life this is I don't know.

## Examples

## Table (forward goes to index.js)

The first example is table, once the container is painted we get an entry, we can see the values here. After 5 seconds we update some cells and we recieve a new entry. This is mainly due to the fact we've added some text nodes to some cells that weren't there before. So if you updated those cells a second time nothing would happen, this component is fully rendered.

You can see the difference between renderTime and startTime in the second object.
We can also see the same with lastPaintedSubElement

## Adding Content

So this one is similar, the difference here is we're injecting a new paragraph into the DOM.
We start with one entry, and once the paragraph is injected we recieve a second entry.

This works because the polyfill uses a mutation observer and immediately adds the `elementtiming` attribute to the incoming element.

We can see the "p" was the last painted element

### Shadow DOM

We have a basic Shadow DOM component here.

The polyfill does not work for this one because it only searches for `elementtiming` elements with children, the shadowRoot inside the host doesn't count as a child. But even if it did, it wouldn't see the DOM updates as any events happening within the shadowRoot won't bubble up into the observer in the root window.

From a polyfill perspective you could argue this is working as expected, but if we do expect to see components being used more often in future then its inevitable that we will want paint events for these.

I did notice that we receive a `PerformanceElementTiming` event from a shadow root, so it looks like the browser already treats it as a singular element.

Pros:

- Web Components are already calculated as a single component and will fire (only once) when there's the first paint event

Cons:

- If a component has multiple paint events (asynchronous loading) this won't be taken into account.

There has been discussion on this at:
https://github.com/WICG/webcomponents/issues/816

Open Question:
Do Shadow DOM roots have "container" behavior or "singular element" behavior?

## SVG

I don't think its possible for the polyfill to make this work, there is nothing for us to hook into to know when this has painted. You'll notice you get nothing in devtools for this example. Any solution here would need to be provided by the browser natively.

That being said, I think there's an open questions of whether an SVG has the behavior of a singular (1 event) element or a container element (potentially multiple events)

--- back to presentation ----

## Continued Observation

Unlike element timing which is binary (it's either rendered or it hasn't), container timing in this polyfill emits entries multiple times for each new paint within it.

A current flaw with this implementation is it will continue to fire events long after there's interaction or the application has started up. If you imagine a carousel at the top of the page with elementtiming, it may continue emitting entries for each new image injected in. If we're focused on startUp this won't be useful.

In Largest Contentful Paint, we stop observing once there's been some interaction such as "click" or "keydown", there is scope to do this here, although it may make sense to follow the "element-timing" which doesn't do this.

Open Question:
Do we let the developer stop observing when there's interaction, or do we stop emitting entries when there's interaction.

## Questions

Open Question number 1:

- Q1 Should we include size? Largest Contentful Paint has "size", if we were to include this we would need to call `getClientBoundingRects()` or some similar API and this will trigger style and layout. How much of a problem in real life this is I don't know.
- Q2 Do we let the developer stop observing when there's interaction, or do we stop emitting entries when there's interaction.
- Q3 Should the shadowDOM emit a single event or emit multiple events like containers do?

## Are mutationObservers racy?

Because mutations fired async..
Are they though? I think text would be presented in the very next frame, since it worked with text i think it should work.

Testing with very slow machines, or the spec would give us a guaruntee on timing. YOu could use user timing and measure when you're calling these observers.

Mutation Observer reports in the next microtask

It seems you need to inject the polyfill very eagerly, and the content needs to have the annotation already there.

If you're server generating a page

## How should nested containers work?

## What percentage of the container has been painted? Most containers expand to fill their contents

## Regarding the question from slide 14, yes we should let developers to indicate to stop when they're getting events from the container. I don't know the form of the API a timeout or a disconnect.

Yoav: Remove the attribute could stop the events.

## Have you spent time thinking about the performance impact of implementing it, of traversing containers

An easy way to test the worst case scenario, is to report elementtiming for everything in chromium and see if that regresses (at the very least). I would hide it behind a flag and then flip the flat in webpage test then try it on a bunch of sites and see if there's any visible impact or not.

Even if it doesn't show on your local benchmark its likely to show on wider scale or percentiles.

## Shadow DOM

We have an open issue we discussed it thoroughly, if element timing would have reported inside open shadow DOM's. Would that be enough for the polyfil.

### Why is element timing not support in shadow dom?

Yoav: For simplification we ignored that, for closed trees there was resistance from exposing timing from closed trees. Folks have been creating closed tree's as some form of security barrier (which it isn't)

https://docs.google.com/document/d/1RbszCu4NG-fcRRoL1TsP6SvjohIuz-uxv5NZm_6iA4U/edit#heading=h.3zh1jt8o97dg
https://1drv.ms/p/s!AieUMe5bQRWh8qlurhV_ghxLZDor-A?e=ElL16f
https://youtu.be/sOaZsMFScE0

^^ element timing is not the only one have this restriction. i.e, selection API also have similar restriction

We didn't get concensus on it and we moved on.

Noam: There may be ways to expose the shadowRoot to the performance observer.

### The biggest question to me is you had this wonderful slide show, the table example, your full page is made up of these tiny element, you get an LCP of a tiny textbox, now with container element, the very first container OR do we want to handle streams of paints within a container?

## Now we have a polyfill, is anyone in the room planning on trying to use that? Is that interesting enough for you to try and use or are there bits that are still missing?

Andy Davies: I was going to create some examples of things I see in the wild and see how it affected it.
Nic Jansma: we would be interested in testing it and understanding the performance of it.

## Could registration be lazier??
