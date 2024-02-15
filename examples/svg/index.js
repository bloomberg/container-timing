const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(entry);
  });
});

observer.observe({
  entryTypes: ["element", "paint", "largest-contentful-paint"],
  buffered: true,
});
