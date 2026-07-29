interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function showRectsOnScreen(rects: Rect[]): void {
    // TODO We may want to batch these DOM updates
    rects.forEach((rect) => {
        const div = document.createElement('div');
        div.classList.add('overlay');
        div.style.left = `${rect.left}px`;
        div.style.top = `${rect.top}px`;
        div.style.width = `${rect.width}px`;
        div.style.height = `${rect.height}px`;
        div.setAttribute("containertiming-ignore", "");
        document.body.appendChild(div);
    });
}

export function showBoundingRect(rect: Rect): void {
    const div = document.createElement('div');
    div.classList.add('boundingRect');
    div.style.left = `${rect.left}px`;
    div.style.top = `${rect.top}px`;
    div.style.width = `${rect.width}px`;
    div.style.height = `${rect.height}px`;
    div.setAttribute("containertiming-ignore", "");
    document.body.appendChild(div);
}

export function clearRects(): void {
    document.querySelectorAll('.overlay').forEach(elm => elm.remove());
    document.querySelectorAll('.boundingRect').forEach(elm => elm.remove());
}

export function clearRectsWithDelay(delay: number): void {
    setTimeout(() => clearRects(), delay);
}
