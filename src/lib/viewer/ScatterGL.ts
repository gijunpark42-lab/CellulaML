/** Minimal WebGL point renderer. Data-space -> clip-space via a 2D affine view. */

const VS = `
attribute vec2 a_pos;
attribute vec3 a_color;
uniform vec2 u_scale;
uniform vec2 u_offset;
uniform float u_size;
varying vec3 v_color;
void main() {
  gl_Position = vec4(a_pos * u_scale + u_offset, 0.0, 1.0);
  gl_PointSize = u_size;
  v_color = a_color;
}`;

const FS = `
precision mediump float;
varying vec3 v_color;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  gl_FragColor = vec4(v_color, 1.0);
}`;

export interface View {
  /** data-space center */
  cx: number;
  cy: number;
  /** data units per CSS pixel */
  unitsPerPx: number;
}

export class ScatterGL {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private posBuf: WebGLBuffer;
  private colBuf: WebGLBuffer;
  private uScale: WebGLUniformLocation;
  private uOffset: WebGLUniformLocation;
  private uSize: WebGLUniformLocation;
  private n = 0;
  private canvas: HTMLCanvasElement;
  pointSize = 4;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) throw new Error("WebGL is not available in this browser");
    this.gl = gl;
    this.prog = this.link(VS, FS);
    gl.useProgram(this.prog);
    this.posBuf = gl.createBuffer()!;
    this.colBuf = gl.createBuffer()!;
    this.uScale = gl.getUniformLocation(this.prog, "u_scale")!;
    this.uOffset = gl.getUniformLocation(this.prog, "u_offset")!;
    this.uSize = gl.getUniformLocation(this.prog, "u_size")!;
    this.bindAttr("a_pos", this.posBuf, 2);
    this.bindAttr("a_color", this.colBuf, 3);
    gl.clearColor(0.03, 0.03, 0.04, 1);
  }

  private link(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    return p;
  }

  private bindAttr(name: string, buf: WebGLBuffer, size: number) {
    const gl = this.gl;
    const loc = gl.getAttribLocation(this.prog, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  /** xy interleaved, length 2n */
  setPositions(xy: Float32Array) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, xy, gl.STATIC_DRAW);
    this.n = xy.length / 2;
  }

  /** rgb interleaved, length 3n */
  setColors(rgb: Float32Array) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, rgb, gl.STATIC_DRAW);
  }

  /** Resize drawing buffer to CSS size * dpr. Returns true if size changed. */
  resize(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width === w && this.canvas.height === h) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    return true;
  }

  draw(view: View) {
    const gl = this.gl;
    const dpr = window.devicePixelRatio || 1;
    const wPx = this.canvas.width / dpr;
    const hPx = this.canvas.height / dpr;
    // clip = (data - center) / (unitsPerPx * halfSizePx)
    const sx = 2 / (view.unitsPerPx * wPx);
    const sy = 2 / (view.unitsPerPx * hPx);
    gl.uniform2f(this.uScale, sx, sy);
    gl.uniform2f(this.uOffset, -view.cx * sx, -view.cy * sy);
    gl.uniform1f(this.uSize, this.pointSize * dpr);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.n > 0) gl.drawArrays(gl.POINTS, 0, this.n);
  }

  /** Free GPU resources. Does NOT lose the context: the canvas may be re-used
   *  (React StrictMode mounts twice), and a lost context cannot be re-acquired. */
  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.posBuf);
    gl.deleteBuffer(this.colBuf);
    gl.deleteProgram(this.prog);
    this.n = 0;
  }
}

/** View that fits all points with a margin. */
export function fitView(xy: Float32Array, wPx: number, hPx: number): View {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < xy.length; i += 2) {
    const x = xy[i], y = xy[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { cx: 0, cy: 0, unitsPerPx: 1 };
  const w = Math.max(maxX - minX, 1e-6), h = Math.max(maxY - minY, 1e-6);
  const unitsPerPx = Math.max(w / wPx, h / hPx) * 1.1;
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, unitsPerPx };
}
