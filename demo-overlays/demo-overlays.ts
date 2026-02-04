interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function showRectsOnScreen(rects: Rect[]): void {
  // TODO We may want to batch these DOM updates
  rects.forEach((rect) => {
    const div = document.createElement("div");
    div.classList.add("overlay");
    div.style.left = `${rect.left}px`;
    div.style.top = `${rect.top}px`;
    div.style.width = `${rect.width}px`;
    div.style.height = `${rect.height}px`;
    div.setAttribute("containertiming-ignore", "");
    document.body.appendChild(div);
  });
}

export function showLCPRect(rect: Rect): void {
  // Remove previous LCP rect if it exists
  document.querySelectorAll(".lcp-rect").forEach((elm) => elm.remove());

  const div = document.createElement("div");
  div.classList.add("lcp-rect");
  div.style.left = `${rect.left}px`;
  div.style.top = `${rect.top}px`;
  div.style.width = `${rect.width}px`;
  div.style.height = `${rect.height}px`;
  document.body.appendChild(div);
}

export function showLCPInfoBox(renderTime: number): void {
  // Remove previous info box if it exists
  document.querySelectorAll(".lcp-info-box").forEach((elm) => elm.remove());

  const div = document.createElement("div");
  div.classList.add("lcp-info-box");
  div.setAttribute("containertiming-ignore", "");
  div.innerHTML = `<strong>LCP Render Time:</strong> ${renderTime.toFixed(2)}ms`;
  document.body.appendChild(div);
}

export function showBoundingRect(rect: Rect, type?: string): void {
  // Remove previous bounding rect if it exists
  document.querySelectorAll(".boundingRect").forEach((elm) => elm.remove());

  const div = document.createElement("div");
  div.classList.add("boundingRect");
  if (type && type === "lcp-rect") {
    div.classList.add("lcp-rect");
  }
  div.style.left = `${rect.left}px`;
  div.style.top = `${rect.top}px`;
  div.style.width = `${rect.width}px`;
  div.style.height = `${rect.height}px`;
  div.setAttribute("containertiming-ignore", "");
  document.body.appendChild(div);
}

export function showContainerInfoBox(startTime: number): void {
  // Remove previous info box if it exists
  document
    .querySelectorAll(".container-info-box")
    .forEach((elm) => elm.remove());

  const div = document.createElement("div");
  div.classList.add("container-info-box");
  div.setAttribute("containertiming-ignore", "");
  div.innerHTML = `<strong>Container Render Time:</strong> ${startTime.toFixed(2)}ms`;
  document.body.appendChild(div);
}

export function clearRects(): void {
  document.querySelectorAll(".overlay").forEach((elm) => elm.remove());
  document.querySelectorAll(".boundingRect").forEach((elm) => elm.remove());
}

export function clearRectsWithDelay(delay: number): void {
  setTimeout(() => clearRects(), delay);
}
