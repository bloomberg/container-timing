window.ctDebug = true;
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(entry);
  });
});

observer.observe({ type: "container" });

window.setTimeout(() => {
  document.querySelectorAll(".dynupdate").forEach((elm) => {
    elm.innerHTML = "dynamic update";
  });
}, 5000);

window.setTimeout(() => {
  const changingCell = document.querySelector("#cell-change");
  const newCell = document.createElement("div");
  newCell.classList.add("cell", "glow");
  newCell.textContent = "80.81";
  newCell.style = "text-align: right; left: 1084px; width: 205px";
  changingCell.parentElement.replaceChild(newCell, changingCell);
  window.setTimeout(() => {
    newCell.classList.remove("glow");
  }, 1000);
}, 10000);
