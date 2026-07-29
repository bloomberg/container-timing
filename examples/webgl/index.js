const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl");

const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec3 a_color;
  varying vec3 v_color;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_color = a_color;
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  varying vec3 v_color;
  void main() {
    gl_FragColor = vec4(v_color, 1.0);
  }
`;

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

const program = gl.createProgram();
gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexShaderSource));
gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
gl.linkProgram(program);
gl.useProgram(program);

// Interleaved position (x, y) and color (r, g, b) for a triangle
const data = new Float32Array([
  //  x      y     r     g     b
    0.0,   0.8,  1.0,  0.2,  0.2,   // top — red
   -0.8,  -0.8,  0.2,  1.0,  0.2,   // bottom-left — green
    0.8,  -0.8,  0.2,  0.2,  1.0,   // bottom-right — blue
]);

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

const stride = 5 * Float32Array.BYTES_PER_ELEMENT;

const posLoc = gl.getAttribLocation(program, "a_position");
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);

const colorLoc = gl.getAttribLocation(program, "a_color");
gl.enableVertexAttribArray(colorLoc);
gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

gl.clearColor(0.1, 0.1, 0.1, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.drawArrays(gl.TRIANGLES, 0, 3);

const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    console.log(entry);
  });
});

observer.observe({ type: ["element"], buffered: true });
observer.observe({ type: ["paint"], buffered: true });
observer.observe({ type: ["largest-contentful-paint"], buffered: true });
observer.observe({ type: ["container"], buffered: true });
