## Container Definitions

With our Container Timing API not only do we need to define which DOM nodes are considered containers, but also how to identify them and what properties they should have. This section outlines the structure and attributes of container definitions plus the problems we face with the current design.

The following document assumes we have moved from containertiming-nesting to containertiming-modes which is described [here](https://github.com/bloomberg/container-timing/issues/22#issuecomment-3486196612)

### Structure of Container Definitions (Today)

Today a container is defined like this:

```html
<div containertiming="my-container">
  <!-- div content goes here -->
</div>
```

With a performanceObserver setup to listen for container timing entries:

```javascript
const observer = new PerformanceObserver((list) => {
  $;
  for (const entry of list.getEntries()) {
    console.log(entry);
  }
});
observer.observe({ type: "container" });
```

For a single user (one developer owning the page), this is sufficient. However, in a more complex scenario where multiple developers or third-party scripts are involved, we face several challenges.

What if multiple observers want to listen to the same container with different rules or provide different IDs? Nesting rules make this an issue.

```html
<div containertiming="container-outer">
  <div
    containertiming="container-inner"
    id="foo"
    containertiming-mode="private"
  >
    <!-- content -->
  </div>
</div>
```

In this case theres already a mode on the inner container. This rule won't send values upstream to the next container. However, another user may want to receive entries for `container-inner` as well as any from `container-outer`. This creates a conflict in how these entries are reported.

A second problem to this is that these attributes need to be applied before painting has happened so the browser can correctly track the timing of these containers.

### Registering in the PerformanceObserver

To address these issues, one idea is to allow developers to register containers dynamically in the PerformanceObserver. This would allow multiple observers to listen to the same container with different configurations.

Lets imagine this tree:

```html
<div id="foo">
  <!-- content -->
</div>
```

```javascript
// Define container rules for Observer A
const containerRulesA = {
  root: document.getElementById("foo"),
  id: "observer-A",
};

const observerA = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log("Observer A:", entry);
  }
});

// Define container rules for Observer B
const containerRulesB = {
  root: document.getElementById("foo"),
  id: "observer-B",
};

const observerB = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log("Observer B:", entry);
  }
});

observerA.observe({
  type: "container",
  buffered: true,
  containerRules: containerRulesA,
});

observerB.observe({
  type: "container",
  buffered: true,
  containerRules: containerRulesB,
});
```

This works fine with 1 container, but nesting becomes problematic again. If we have nested containers, how do we handle the different rules for each observer? Do they conflict? is there a single context for each "tree" of containers?

For instance, if container rules were global and a performance observer decides to make a container "private", it may be too late if another observer has already registered a container above which will receive entries from the inner container.

```html
<div id="outer">
  <div id="inner">
    <!-- content -->
  </div>
</div>
```

```javascript
const observerA = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log("Observer A:", entry);
  }
});

const observerB = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log("Observer B:", entry);
  }
});

observerA.observe({
  type: "container",
  buffered: true,
  containerRules: {
    root: document.getElementById("outer"),
    id: "outer-container",
  },
});

// 30 seconds later, another observer registers a nested container
observerB.observe({
  type: "container",
  buffered: true,
  containerRules: {
    root: document.getElementById("inner"),
    id: "inner-container",
    mode: "private", // despite private being set, Observer A may have already received entries from here
  },
});
```

In the example above, by the time Observer B has registered its container and started observing, Observer A has already received entries from the inner container. This creates a conflict in how entries are reported and whether privacy modes are respected.

The second problem with this approach is that if the container is registered before the DOM has populated, there is no element reference to pass to the observer. This could be an issue for SPA's where the Observers can be set up before the content is added to the DOM.

## Options?

### Option 1: Keep API attribute-focused (as is)

This would mean keeping everything declared in the attributes instead of anywhere else.

**Pros**

- Simple API just mark the HTML elements with containertiming attributes, alongside some rules you want
- This is performant because the renderer knows the rules when its parsing the element, it doesn't need to "anticipate" which elements are going to need timing data.

**Cons**

- You can't have two or more observers on the same root setting different rules. If someone sets rule private it will be overwritten by someone else setting it to transparent etc
- You can't have two or more different IDs for a container root as it is set directly on the root. A second observer would need to use whichever identifier is set, you can see more of this discussed [here](https://github.com/bloomberg/container-timing/issues/20)
- Limited API which works well for single author, but won't help if components are observed by different users.
- "ignore" is global

### Option 2: Allow dynamic registration but remove private mode, or all modes entirely

One option is to remove the private mode from the API. This would simplify the design and avoid conflicts between observers. Private was mainly used to avoid showing information from places where the containers had little interest (ads), but we have `containertiming-ignore` for that now. Ignore on its own may be enough, there isn't a strong use case for "i want a container but i don't want to propagate my timing entries".
This would also mean we would need to get rid of shadowed mode too, as `"shadow"` has the same issue when registering late or having multiple observers. We could leave "shadowed" to some designated "built-in" types, such as iframes, Shadow DOM, SVG's tables etc. If you want to force shadowing you can use a shadow root for your container.

**Pros**:

- Simpler API
- Ignore can still be achieved
- Shadow Mode will "just work" for some elements already.
- Identifiers can be set per observer.

**Cons**:

- You may not have the element yet if the DOM is not ready, in which case its impossible to register interest in a DOM root.
- The browser would need to track every element for timing information as it won't know ahead-of-time which elements we're interested in, this could cause memory issues as every element being painted would need to store more metadata. (need to test)
- The last container timing event you get may differ depending on when you registered, this means results may not be deterministic (even if the page is the same).
- "containertiming-ignore" is global

### Option 3: Declarative Container Rules

Another option is to keep the declarative approach but apply it as a set of container rules the browser parses before it begins painting. This would allow us to set modes such as "private" or "shadowed", because they're set from the beginning.

```html
<script type="containerrules">
  {
    "containers": [
      {
        "selector": "#outer",
        "id": "outer-container"
      },
      {
        "selector": "#inner",
        "id": "inner-container",
        "mode": "private"
      }
    ]
  }
</script>
```

```javascript
const observer = new PerformanceObserver((list) => {
  $;
  for (const entry of list.getEntries()) {
    console.log(entry);
  }
});
observer.observe({ type: "container", containerId: "outer-container" });
```

**Pros**

- You could use modes with format because they would be set from the beginning.
- Much better memory performance (not adding metadata to elements we don't care about)
- We could even drop entries if there's no corresponding observer for an ID after a certain amount of time

**Cons**:

- You wouldn't be able to register new container rules dynamically (due to the issue above).
- Ignore is global

### Option 4: Do we need to start thinking in terms of "Container Trees"?

All the options above treat the containers as global, any rule set on one has a global affect across all performance observers (this is why "ignore" is global in all options).
We may need to define a "tree" of containers under a single ID and only track containers defined within that tree for that observer.

How does this look? Well, we could copy Option 3 but this time allow dynamic container rules to be added.

```html
<script type="containerrules">
    {
      "containerTrees": {
          "tree1": [
            {
              "selector": "#outer",
              "id": "outer-container"
            },
            {
              "selector": "#inner",
              "id": "inner-container",
              "mode": "private"
            }
          ],
          "tree2": [
            {
              "selector": "#outer",
              "id": "outer-container"
            },
            {
              "selector": "#inner",
              "id": "inner-container",
            }
          ]
      }
  }
</script>
```

```javascript
const observer = new PerformanceObserver((list) => {
  $;
  for (const entry of list.getEntries()) {
    console.log(entry);
  }
});
observer.observe({ type: "container", containerId: "tree1" });
```

In this scenario, adding a new container rule would not have any effect on adjacent trees, timing data for those would continue as expected. "tree1" making inner private doesn't prevent "tree2" from receiving timing information.

**Pros**

- Container Trees can be defined up front which declare the relationship between different containers within that tree
- Ignoring or making private a root wouldn't have any affect on other trees.
- Potential for dynamic containers to be added later to a tree (although the encapsulation change would still be a problem)

**Cons**

- Much more complicated implementation, most users of this feature wouldn't need multiple trees for performance measuring.
- We would most likely still want a global ignore (to make life easier) for authors who just want to ignore an ad container for example
