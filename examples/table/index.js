window.ctDebug = true;
const observer = new ContainerPerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(entry);
  });
});

observer.observe({ method: "newAreaPainted" });

window.setTimeout(() => {
  document.querySelectorAll(".dynupdate").forEach((elm) => {
    elm.innerHTML = "dynamic update";
  });
}, 5000);

window.setTimeout(() => {
  const changingCell = document.querySelector("#cell-change");
  const newCell = document.createElement("div");
  newCell.classList.add("cell");
  newCell.textContent = "80.81";
  newCell.style = "text-align: right; left: 1084px; width: 205px";
  changingCell.parentElement.replaceChild(newCell, changingCell);
}, 10000);
