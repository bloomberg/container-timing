const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(entry);
  });
});

observer.observe({ type: ["element"], buffered: true });
observer.observe({ type: ["paint"], buffered: true });
observer.observe({ type: ["largest-contentful-paint"], buffered: true });
observer.observe({ type: ["container"], buffered: true });
