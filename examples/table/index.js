const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(entry);
  });
});

observer.observe({ type: "element", buffered: true });

window.setTimeout(() => {
  document.querySelectorAll(".dynupdate").forEach((elm) => {
    elm.innerHTML = "dynamic update";
  });
}, 5000);

// window.setTimeout(() => {
//   document.querySelectorAll(".dynupdate").forEach((elm) => {
//     elm.innerHTML = "bar";
//   });
// }, 10000);
