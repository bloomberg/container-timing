window.ctDebug = true;
const observer = new ContainerPerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(entry);
  });
});

observer.observe({ method: "newAreaPainted", nestedStrategy: "transparent" });

window.setTimeout(() => {
  const innerContainer = document.querySelector(".container div");
  const paragraph = document.createElement("p");
  paragraph.textContent =
    '"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."';
  innerContainer.appendChild(paragraph);
}, 5000);

window.setTimeout(() => {
  const innerContainer = document.querySelector(".inner");
  const paragraph = document.createElement("p");
  paragraph.textContent =
    '"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."';
  innerContainer.appendChild(paragraph);
}, 10000);
