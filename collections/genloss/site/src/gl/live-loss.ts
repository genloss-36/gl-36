const VERT = `#version 300 es
in vec2 p;
out vec2 vUv;
void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 o;
const float PI = 3.14159265358979;
float C(int u, int k) { return (u == 0 ? 0.35355339 : 0.5) * cos(float((2 * k + 1) * u) * PI / 16.0); }
int local(int v, int off) { return ((v + off) % 8 + 8) % 8; }
`;

const SOURCE = `${HEAD}
uniform sampler2D uPrev;
uniform sampler2D uOrig;
uniform vec2 uRes;
uniform vec2 uPtr;
uniform vec2 uVel;
uniform float uLens;
uniform float uRestore;
uniform float uTime;
uniform vec2 uCover;
void main() {
  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
  vec2 c = vUv - 0.5;
  vec2 flow = -c * 0.0011 + vec2(-c.y, c.x) * sin(uTime * 0.05) * 0.0009;
  float d = length((vUv - uPtr) * aspect);
  flow += uVel * exp(-d * d * 22.0) * 1.4;
  vec3 prev = texture(uPrev, vUv - flow).rgb;
  vec3 orig = texture(uOrig, (vUv - 0.5) * uCover + 0.5).rgb;
  float lens = uLens * smoothstep(0.24, 0.04, d);
  vec3 col = mix(prev, orig, clamp(uRestore + lens * 0.3, 0.0, 1.0));
  float y = dot(col, vec3(0.299, 0.587, 0.114));
  o = vec4(y - 0.5, (col.b - y) * 0.564, (col.r - y) * 0.713, 1.0);
}`;

const ROW_DCT = `${HEAD}
uniform sampler2D uIn;
uniform ivec2 uOff;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int w = textureSize(uIn, 0).x;
  int u = local(p.x, uOff.x);
  int x0 = p.x - u;
  vec3 s = vec3(0.0);
  for (int k = 0; k < 8; k++) s += C(u, k) * texelFetch(uIn, ivec2(clamp(x0 + k, 0, w - 1), p.y), 0).rgb;
  o = vec4(s, 1.0);
}`;

const COL_DCT_QUANT = `${HEAD}
uniform sampler2D uIn;
uniform ivec2 uOff;
uniform float uQy[64];
uniform float uQc[64];
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int h = textureSize(uIn, 0).y;
  int v = local(p.y, uOff.y);
  int y0 = p.y - v;
  vec3 s = vec3(0.0);
  for (int k = 0; k < 8; k++) s += C(v, k) * texelFetch(uIn, ivec2(p.x, clamp(y0 + k, 0, h - 1)), 0).rgb;
  int idx = v * 8 + local(p.x, uOff.x);
  float qy = uQy[idx], qc = uQc[idx];
  o = vec4(round(s.x / qy) * qy, round(s.yz / qc) * qc, 1.0);
}`;

const COL_IDCT = `${HEAD}
uniform sampler2D uIn;
uniform ivec2 uOff;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int h = textureSize(uIn, 0).y;
  int y = local(p.y, uOff.y);
  int y0 = p.y - y;
  vec3 s = vec3(0.0);
  for (int v = 0; v < 8; v++) s += C(v, y) * texelFetch(uIn, ivec2(p.x, clamp(y0 + v, 0, h - 1)), 0).rgb;
  o = vec4(s, 1.0);
}`;

const ROW_IDCT_RGB = `${HEAD}
uniform sampler2D uIn;
uniform ivec2 uOff;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int w = textureSize(uIn, 0).x;
  int x = local(p.x, uOff.x);
  int x0 = p.x - x;
  vec3 f = vec3(0.0);
  for (int u = 0; u < 8; u++) f += C(u, x) * texelFetch(uIn, ivec2(clamp(x0 + u, 0, w - 1), p.y), 0).rgb;
  float Y = f.x + 0.5;
  o = vec4(clamp(vec3(Y + 1.402 * f.z, Y - 0.344 * f.y - 0.714 * f.z, Y + 1.772 * f.y), 0.0, 1.0), 1.0);
}`;

const PRESENT = `${HEAD}
uniform sampler2D uIn;
void main() {
  o = vec4(texture(uIn, vUv).rgb, 1.0);
}`;

const Q_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const Q_CHROMA = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  ...new Array(32).fill(99),
];

function table(base: number[], q: number, out: Float32Array) {
  const s = q < 50 ? 5000 / q : 200 - q * 2;
  for (let i = 0; i < 64; i++) out[i] = Math.min(255, Math.max(1, Math.floor((base[i] * s + 50) / 100))) / 255;
}

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

export interface LossInput {
  ptr: [number, number];
  vel: [number, number];
  lens: number;
  quality: number;
  time: number;
}

export class LiveLoss {
  readonly gl: WebGL2RenderingContext;
  private progs: Record<string, Prog> = {};
  private vao: WebGLVertexArrayObject;
  private w = 8;
  private h = 8;
  private f32: WebGLTexture[] = [];
  private rgb: WebGLTexture[] = [];
  private fbo: WebGLFramebuffer;
  private orig: WebGLTexture;
  private cover: [number, number] = [1, 1];
  private qy = new Float32Array(64);
  private qc = new Float32Array(64);
  private flip = 0;
  private off: [number, number] = [0, 0];
  saves = 0;

  static create(canvas: HTMLCanvasElement): LiveLoss | null {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
    try {
      return new LiveLoss(gl);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const sources: Record<string, string> = { SOURCE, ROW_DCT, COL_DCT_QUANT, COL_IDCT, ROW_IDCT_RGB, PRESENT };
    for (const [k, src] of Object.entries(sources)) this.progs[k] = this.program(src);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.fbo = gl.createFramebuffer()!;
    this.orig = this.texture(gl.RGBA8, 1, 1, gl.LINEAR);
  }

  private program(fs: string): Prog {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "p");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
    const u: Prog["u"] = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i)!.name.replace(/\[0\]$/, "");
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  private texture(fmt: number, w: number, h: number, filter: number) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  resize(w: number, h: number) {
    const gl = this.gl;
    w = Math.max(64, Math.round(w / 8) * 8);
    h = Math.max(64, Math.round(h / 8) * 8);
    if (w === this.w && h === this.h && this.f32.length) return;
    [...this.f32, ...this.rgb].forEach((t) => gl.deleteTexture(t));
    this.w = w;
    this.h = h;
    (gl.canvas as HTMLCanvasElement).width = w;
    (gl.canvas as HTMLCanvasElement).height = h;
    this.f32 = [this.texture(gl.RGBA32F, w, h, gl.NEAREST), this.texture(gl.RGBA32F, w, h, gl.NEAREST)];
    this.rgb = [this.texture(gl.RGBA8, w, h, gl.LINEAR), this.texture(gl.RGBA8, w, h, gl.LINEAR)];
    this.updateCover();
    this.seed();
  }

  setImage(img: ImageBitmap) {
    const gl = this.gl;
    gl.deleteTexture(this.orig);
    this.orig = this.texture(gl.RGBA8, img.width, img.height, gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.updateCover();
    this.seed();
  }

  private updateCover() {
    const a = this.w / this.h;
    this.cover = a >= 1 ? [1, 1 / a] : [a, 1];
  }

  private seed() {
    if (!this.rgb.length) return;
    this.save({ ptr: [-1, -1], vel: [0, 0], lens: 0, quality: 92, time: 0 }, 1);
  }

  private bind(loc: WebGLUniformLocation | null, unit: number, tex: WebGLTexture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  private pass(name: string, target: WebGLTexture | null, set: (u: Prog["u"]) => void) {
    const gl = this.gl;
    const { p, u } = this.progs[name];
    gl.useProgram(p);
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, this.w, this.h);
    set(u);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  shiftGrid() {
    this.off = [(Math.random() * 8) | 0, (Math.random() * 8) | 0];
  }

  private save(inp: LossInput, restore: number) {
    const gl = this.gl;
    table(Q_LUMA, inp.quality, this.qy);
    table(Q_CHROMA, inp.quality, this.qc);
    const prev = this.rgb[this.flip];
    const next = this.rgb[1 - this.flip];
    const [a, b] = this.f32;
    this.pass("SOURCE", a, (u) => {
      this.bind(u.uPrev, 0, prev);
      this.bind(u.uOrig, 1, this.orig);
      gl.uniform2f(u.uRes, this.w, this.h);
      gl.uniform2f(u.uPtr, inp.ptr[0], inp.ptr[1]);
      gl.uniform2f(u.uVel, inp.vel[0], inp.vel[1]);
      gl.uniform1f(u.uLens, inp.lens);
      gl.uniform1f(u.uRestore, restore);
      gl.uniform1f(u.uTime, inp.time);
      gl.uniform2f(u.uCover, this.cover[0], this.cover[1]);
    });
    const off = (u: Prog["u"]) => gl.uniform2i(u.uOff, this.off[0], this.off[1]);
    this.pass("ROW_DCT", b, (u) => { this.bind(u.uIn, 0, a); off(u); });
    this.pass("COL_DCT_QUANT", a, (u) => {
      this.bind(u.uIn, 0, b);
      off(u);
      gl.uniform1fv(u.uQy, this.qy);
      gl.uniform1fv(u.uQc, this.qc);
    });
    this.pass("COL_IDCT", b, (u) => { this.bind(u.uIn, 0, a); off(u); });
    this.pass("ROW_IDCT_RGB", next, (u) => { this.bind(u.uIn, 0, b); off(u); });
    this.flip = 1 - this.flip;
  }

  frame(inp: LossInput, restore = 0.012) {
    this.save(inp, restore);
    this.saves++;
    this.pass("PRESENT", null, (u) => this.bind(u.uIn, 0, this.rgb[this.flip]));
  }

  destroy() {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
