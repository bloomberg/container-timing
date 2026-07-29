const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Gradient background
const gradient = ctx.createLinearGradient(0, 0, 400, 300);
gradient.addColorStop(0, "#1a1a2e");
gradient.addColorStop(1, "#16213e");
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 400, 300);

// Colored circles
const colors = ["#e94560", "#0f3460", "#533483", "#e94560", "#0f3460"];
for (let i = 0; i < 5; i++) {
  ctx.beginPath();
  ctx.arc(50 + i * 75, 150, 40, 0, Math.PI * 2);
  ctx.fillStyle = colors[i];
  ctx.fill();
}

// Label
ctx.fillStyle = "#ffffff";
ctx.font = "bold 18px Arial";
ctx.textAlign = "center";
ctx.fillText("2D Canvas", 200, 270);

const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(entry);
  });
});

observer.observe({ type: ["element"], buffered: true });
observer.observe({ type: ["paint"], buffered: true });
observer.observe({ type: ["largest-contentful-paint"], buffered: true });
observer.observe({ type: ["container"], buffered: true });
