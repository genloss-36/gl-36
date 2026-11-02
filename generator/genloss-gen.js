export const VERSION = "genloss-gen/4";
export const SIZE = 256;
const W2 = SIZE * 2;

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const H256 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

export function sha256(msg) {
  const len = msg.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(len / 0x20000000));
  dv.setUint32(total - 4, (len * 8) >>> 0);
  const h = H256.slice();
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      w[i] = w[i - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) + w[i - 7] + (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10));
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i] >>> 0);
  return out;
}

const utf8 = (s) => new TextEncoder().encode(s);

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const u16le = (v) => new Uint8Array([v & 0xff, (v >> 8) & 0xff]);

export function artSeed(collection, secret, entropy, id) {
  return sha256(concat(utf8("genloss/v1"), collection, secret, entropy, u16le(id)));
}

export function previewSeed(id) {
  return sha256(concat(utf8("genloss/preview"), u16le(id)));
}

export function hex(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function makeRng(seed) {
  const v = new DataView(seed.buffer, seed.byteOffset, 32);
  let a = v.getUint32(0, true) ^ v.getUint32(16, true);
  let b = v.getUint32(4, true) ^ v.getUint32(20, true);
  let c = v.getUint32(8, true) ^ v.getUint32(24, true);
  let d = v.getUint32(12, true) ^ v.getUint32(28, true);
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 16; i++) next();
  return {
    u32: next,
    int: (n) => next() % n,
    range: (lo, hi) => lo + (next() % (hi - lo + 1)),
    chance: (permille) => next() % 1000 < permille,
    pick: (arr) => arr[next() % arr.length],
    weighted: (items) => {
      let total = 0;
      for (const [wt] of items) total += wt;
      let r = next() % total;
      for (const [wt, val] of items) {
        if (r < wt) return val;
        r -= wt;
      }
      return items[items.length - 1][1];
    },
  };
}

const stream = (seed, label) => makeRng(sha256(concat(seed, utf8(label))));

const SIN = new Int16Array([
  0, 402, 804, 1205, 1606, 2006, 2404, 2801, 3196, 3590, 3981, 4370, 4756, 5139, 5520, 5897,
  6270, 6639, 7005, 7366, 7723, 8076, 8423, 8765, 9102, 9434, 9760, 10080, 10394, 10702, 11003, 11297,
  11585, 11866, 12140, 12406, 12665, 12916, 13160, 13395, 13623, 13842, 14053, 14256, 14449, 14635, 14811, 14978,
  15137, 15286, 15426, 15557, 15679, 15791, 15893, 15986, 16069, 16143, 16207, 16261, 16305, 16340, 16364, 16379,
  16384, 16379, 16364, 16340, 16305, 16261, 16207, 16143, 16069, 15986, 15893, 15791, 15679, 15557, 15426, 15286,
  15137, 14978, 14811, 14635, 14449, 14256, 14053, 13842, 13623, 13395, 13160, 12916, 12665, 12406, 12140, 11866,
  11585, 11297, 11003, 10702, 10394, 10080, 9760, 9434, 9102, 8765, 8423, 8076, 7723, 7366, 7005, 6639,
  6270, 5897, 5520, 5139, 4756, 4370, 3981, 3590, 3196, 2801, 2404, 2006, 1606, 1205, 804, 402,
  0, -402, -804, -1205, -1606, -2006, -2404, -2801, -3196, -3590, -3981, -4370, -4756, -5139, -5520, -5897,
  -6270, -6639, -7005, -7366, -7723, -8076, -8423, -8765, -9102, -9434, -9760, -10080, -10394, -10702, -11003, -11297,
  -11585, -11866, -12140, -12406, -12665, -12916, -13160, -13395, -13623, -13842, -14053, -14256, -14449, -14635, -14811, -14978,
  -15137, -15286, -15426, -15557, -15679, -15791, -15893, -15986, -16069, -16143, -16207, -16261, -16305, -16340, -16364, -16379,
  -16384, -16379, -16364, -16340, -16305, -16261, -16207, -16143, -16069, -15986, -15893, -15791, -15679, -15557, -15426, -15286,
  -15137, -14978, -14811, -14635, -14449, -14256, -14053, -13842, -13623, -13395, -13160, -12916, -12665, -12406, -12140, -11866,
  -11585, -11297, -11003, -10702, -10394, -10080, -9760, -9434, -9102, -8765, -8423, -8076, -7723, -7366, -7005, -6639,
  -6270, -5897, -5520, -5139, -4756, -4370, -3981, -3590, -3196, -2801, -2404, -2006, -1606, -1205, -804, -402,
]);
const sin = (i) => SIN[i & 255];
const cos = (i) => SIN[(i + 64) & 255];

function isqrt(n) {
  if (n < 2) return n;
  let x = n, y = (x + 1) >> 1;
  while (y < x) { x = y; y = (x + Math.floor(n / x)) >> 1; }
  return x;
}

function hash2(x, y, s) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ s;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function vnoise(x, y, cell, s) {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  const fx = Math.floor(((x - gx * cell) * 256) / cell), fy = Math.floor(((y - gy * cell) * 256) / cell);
  const sx = (fx * fx * (768 - 2 * fx)) >> 16, sy = (fy * fy * (768 - 2 * fy)) >> 16;
  const a = hash2(gx, gy, s) & 0xffff, b = hash2(gx + 1, gy, s) & 0xffff;
  const c = hash2(gx, gy + 1, s) & 0xffff, d = hash2(gx + 1, gy + 1, s) & 0xffff;
  const ab = a + (((b - a) * sx) >> 8), cd = c + (((d - c) * sx) >> 8);
  return ab + (((cd - ab) * sy) >> 8);
}

function fbm(x, y, cell, s) {
  return (vnoise(x, y, cell, s) * 4 + vnoise(x, y, cell >> 1, s + 1) * 2 + vnoise(x, y, cell >> 2, s + 2) + 3) / 7 | 0;
}

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function mix(c1, c2, t) {
  const ch = (s) => {
    const a = (c1 >> s) & 255, b = (c2 >> s) & 255;
    return a + (((b - a) * t) >> 8);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function put(img, i, c) {
  img[i * 3] = (c >> 16) & 255;
  img[i * 3 + 1] = (c >> 8) & 255;
  img[i * 3 + 2] = c & 255;
}

function blend(img, i, c, a) {
  if (a <= 0) return;
  if (a >= 256) return put(img, i, c);
  const o = i * 3;
  img[o] += (((c >> 16) & 255) - img[o]) * a >> 8;
  img[o + 1] += (((c >> 8) & 255) - img[o + 1]) * a >> 8;
  img[o + 2] += ((c & 255) - img[o + 2]) * a >> 8;
}

function fillAll(img, c) {
  for (let i = 0; i < W2 * W2; i++) put(img, i, c);
}

function shape(img, cx, cy, rx, ry, c, inside) {
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W2, Math.floor(cx + rx) + 1);
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(W2, Math.floor(cy + ry) + 1);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (inside(x - cx, y - cy)) put(img, y * W2 + x, c);
}

const PALETTES = [
  [100, ["Bauhaus", [0xf1ead8, 0xe63946, 0xf4b400, 0x1d3557, 0x111111]]],
  [90, ["Rothko", [0x2a0f0f, 0xb3261e, 0xe0702c, 0x5c1a1b, 0xf2b880]]],
  [90, ["Vapor", [0x1a1033, 0xff71ce, 0x01cdfe, 0x05ffa1, 0xb967ff]]],
  [70, ["Solana", [0x0b0b10, 0x9945ff, 0x14f195, 0x00c2ff, 0xf5f5f5]]],
  [80, ["Acid", [0x0a0a0a, 0xb6ff00, 0xff00a8, 0x00f0ff, 0xffffff]]],
  [100, ["Earth", [0xefe6d2, 0xc4622d, 0x8a9a5b, 0x3b2f2a, 0xe0b04a]]],
  [90, ["Ice", [0xeaf4fb, 0x1f4e79, 0x5fa8d3, 0xbfe0f2, 0x0b1f33]]],
  [90, ["Candy", [0xfff0f5, 0xff8fab, 0x9bf6ff, 0xfdffb6, 0x6a4c93]]],
  [100, ["Ink", [0xf3efe6, 0x1b1f3b, 0x3d5a80, 0xee6c4d, 0x98c1d9]]],
  [100, ["Mono", [0xededed, 0x111111, 0x666666, 0xbdbdbd, 0xff3b30]]],
  [90, ["Noir", [0x0d0d0d, 0xf2f2f2, 0x5e5e5e, 0xa3a3a3, 0xffd400]]],
];

const COMPOSITIONS = [
  [170, "DCT Basis"], [160, "Spectrum"], [150, "Bitwise"], [120, "Plasma"], [110, "Geometry"],
  [80, "Rings"], [80, "Waves"], [40, "Contours"], [50, "Color Field"], [40, "Grid"],
];

const TIERS = [
  [20, { name: "Lossless", rounds: [0, 0], q: [100, 100], sub: 1, reup: 0, f: [2, 2], fry: 0 }],
  [300, { name: "Compressed", rounds: [1, 2], q: [10, 20], sub: 2, reup: 600, f: [2, 2], fry: 0 }],
  [350, { name: "Crushed", rounds: [3, 5], q: [6, 12], sub: 2, reup: 400, f: [2, 3], fry: 0 }],
  [200, { name: "Mangled", rounds: [5, 9], q: [4, 9], sub: 2, reup: 400, f: [2, 3], fry: 1 }],
  [100, { name: "Deep Fried", rounds: [6, 10], q: [4, 8], sub: 2, reup: 300, f: [2, 2], fry: 2 }],
  [30, { name: "Legendary", rounds: [40, 60], q: [1, 3], sub: 4, reup: 150, f: [2, 3], fry: 2 }],
];

const GLITCH = [[450, "None"], [300, "Light"], [180, "Heavy"], [70, "Total"]];
const GLITCH_P = { None: 0, Light: 10, Heavy: 45, Total: 180 };
const CHROMA = [[750, "Aligned"], [250, "Shifted"]];
const OVERLAY = [[600, "None"], [250, "Difference"], [150, "XOR"]];
const MOSH = [[550, "None"], [200, "Slices"], [150, "Shuffle"], [100, "Smear"]];

const luma = (c) => (19595 * ((c >> 16) & 255) + 38470 * ((c >> 8) & 255) + 7471 * (c & 255)) >> 16;

function contrasting(pal, base, r) {
  const ok = pal.filter((c) => Math.abs(luma(c) - luma(base)) >= 64);
  if (ok.length) return ok[r.int(ok.length)];
  return pal.reduce((best, c) => (Math.abs(luma(c) - luma(base)) > Math.abs(luma(best) - luma(base)) ? c : best), pal[0]);
}

const others = (pal, r, n) => {
  const pool = pal.slice(1);
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool.length ? pool.splice(r.int(pool.length), 1)[0] : pal[1]);
  return out;
};

function geometry(img, r, pal) {
  fillAll(img, pal[0]);
  const G = W2 / 8;
  for (let n = r.range(3, 8); n > 0; n--) {
    const kind = r.weighted([[3, "circle"], [2, "ring"], [3, "rect"], [2, "bar"], [2, "tri"], [2, "half"], [1, "quarter"], [2, "rot"]]);
    const c = pal[1 + r.int(4)];
    const cx = r.range(1, 7) * G, cy = r.range(1, 7) * G;
    const s = r.range(1, 3) * G;
    switch (kind) {
      case "circle":
        shape(img, cx, cy, s, s, c, (x, y) => x * x + y * y <= s * s);
        break;
      case "ring": {
        const t = r.range(G / 4, G / 2);
        shape(img, cx, cy, s, s, c, (x, y) => { const d = x * x + y * y; return d <= s * s && d >= (s - t) * (s - t); });
        break;
      }
      case "rect": {
        const w = r.range(1, 3) * G / 2, h = r.range(1, 4) * G / 2;
        shape(img, cx, cy, w, h, c, () => true);
        break;
      }
      case "bar": {
        const horiz = r.chance(500), t = r.range(G / 8, Math.floor(G / 3));
        shape(img, cx, cy, horiz ? W2 : t, horiz ? t : W2, c, () => true);
        break;
      }
      case "tri": {
        const o = r.int(4);
        shape(img, cx, cy, s, s, c, (x, y) => {
          const [u, v] = o === 0 ? [x, y] : o === 1 ? [-y, x] : o === 2 ? [-x, -y] : [y, -x];
          return v <= s && 2 * Math.abs(u) <= v + s;
        });
        break;
      }
      case "half": {
        const o = r.int(4);
        shape(img, cx, cy, s, s, c, (x, y) => x * x + y * y <= s * s && (o === 0 ? y <= 0 : o === 1 ? x >= 0 : o === 2 ? y >= 0 : x <= 0));
        break;
      }
      case "quarter": {
        const sx = r.chance(500) ? 1 : -1, sy = r.chance(500) ? 1 : -1;
        shape(img, cx, cy, 2 * s, 2 * s, c, (x, y) => x * x + y * y <= 4 * s * s && x * sx >= 0 && y * sy >= 0);
        break;
      }
      case "rot": {
        const a = r.int(64) * 4, ca = cos(a), sa = sin(a);
        const w = r.range(G, 3 * G), h = r.range(G / 8, G / 2);
        const R = w + h;
        shape(img, cx, cy, R, R, c, (x, y) => {
          const u = (x * ca + y * sa) >> 14, v = (y * ca - x * sa) >> 14;
          return Math.abs(u) <= w && Math.abs(v) <= h;
        });
        break;
      }
    }
  }
}

function colorField(img, r, pal) {
  const cols = others(pal, r, 3);
  fillAll(img, pal[0]);
  const m = r.range(36, 64), gap = r.range(18, 36);
  const n = r.range(2, 3);
  const h = Math.floor((W2 - 2 * m - (n - 1) * gap) / n);
  const seed = r.u32();
  for (let k = 0; k < n; k++) {
    const top = m + k * (h + gap), bot = top + h, c = cols[k], dark = mix(c, 0x000000, 60);
    const amp = r.range(4, 12);
    for (let y = Math.max(0, top - 24); y < Math.min(W2, bot + 24); y++) {
      for (let x = 0; x < W2; x++) {
        const nx = (vnoise(x, y, 48, seed + k) * amp) >> 16, ny = (vnoise(y, x, 48, seed + 7 + k) * amp) >> 16;
        const d = Math.min(x - m + nx, W2 - m - x - nx, y - top + ny, bot - y - ny);
        const a = Math.min(256, Math.max(0, (d + 6) * 21));
        if (a > 0) blend(img, y * W2 + x, mix(c, dark, Math.max(0, Math.min(256, Math.floor(((y - top) * 256) / h)))), a);
      }
    }
  }
}

const basis = (u, v, lx, ly) => DCT[u * 8 + ly] * DCT[v * 8 + lx];

const ramp3 = (stops, t) => (t < 128 ? mix(stops[0], stops[1], t * 2) : mix(stops[1], stops[2], (t - 128) * 2));

function spectrum(img, r, pal) {
  const s = r.weighted([[2, 128], [6, 256], [2, 512]]), k = r.range(2, 4), rgb = s >= 256 && r.chance(500);
  const stops = [pal[0], contrasting(pal.slice(1), pal[0], r), pal[1 + r.int(4)]];
  const table = (cs) => {
    const t = new Float64Array(64);
    for (const [u, v, amp] of cs) for (let i = 0; i < 64; i++) t[i] += amp * basis(u, v, i & 7, i >> 3);
    return t;
  };
  const fq = () => (r.chance(700) ? r.int(4) : r.int(8));
  const coefs = () => Array.from({ length: k }, () => [fq(), fq(), r.range(-3, 3)]);
  for (let gy = 0; gy < W2; gy += s) {
    for (let gx = 0; gx < W2; gx += s) {
      const tabs = rgb ? [table(coefs()), table(coefs()), table(coefs())] : [table(coefs())];
      for (let y = 0; y < s; y++) {
        const ly = Math.floor((y * 8) / s);
        for (let x = 0; x < s; x++) {
          const j = ly * 8 + Math.floor((x * 8) / s), i = (gy + y) * W2 + gx + x;
          if (rgb) {
            for (let c = 0; c < 3; c++) img[i * 3 + c] = clamp8(Math.round(128 + tabs[c][j] * 96));
          } else {
            put(img, i, ramp3(stops, Math.min(256, Math.max(0, Math.round(128 + tabs[0][j] * 96)))));
          }
        }
      }
    }
  }
}

function bitwise(img, r, pal) {
  const op = r.int(6), sh = r.range(2, 5), k = r.range(1, 9), ox = r.int(1024), oy = r.int(1024), b = r.range(0, 3);
  const n = r.range(2, 5);
  const cols = [pal[0], contrasting(pal.slice(1), pal[0], r), ...others(pal, r, n - 2)];
  for (let y = 0; y < W2; y++) {
    for (let x = 0; x < W2; x++) {
      const X = (x + ox) >> sh, Y = (y + oy) >> sh;
      let v;
      switch (op) {
        case 0: v = X ^ Y; break;
        case 1: v = X & Y ? 1 + ((X ^ Y) >> 3) : 0; break;
        case 2: v = (X * Y) >> 4; break;
        case 3: v = (X * X + Y * Y) >> 5; break;
        case 4: v = (X ^ Y) * k + ((X | Y) >> 2); break;
        default: v = ((X * k) ^ (Y * (k + 1))) >> 2;
      }
      put(img, y * W2 + x, cols[(v >> b) % n]);
    }
  }
}

function plasma(img, r, pal) {
  const a = r.range(1, 6), b = r.range(1, 6), c = r.range(1, 4), d = r.range(1, 6);
  const p = [r.int(256), r.int(256), r.int(256), r.int(256)];
  const cx = r.int(W2), cy = r.int(W2), bands = r.range(5, 14);
  const n = r.range(3, 5);
  const cols = [pal[0], contrasting(pal.slice(1), pal[0], r), ...others(pal, r, n - 2)];
  const smooth = r.chance(300);
  const stops = [cols[0], cols[1], cols[2] ?? cols[0]];
  for (let y = 0; y < W2; y++) {
    for (let x = 0; x < W2; x++) {
      const dist = isqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      const v = sin(((x * a) >> 2) + p[0]) + sin(((y * b) >> 2) + p[1]) + sin((((x + y) * c) >> 3) + p[2]) + sin(((dist * d) >> 2) + p[3]);
      put(img, y * W2 + x, smooth ? ramp3(stops, (v + 65536) >> 9) : cols[(((v + 65536) * bands) >> 17) % n]);
    }
  }
}

function grid(img, r, pal) {
  const line = pal[0] === 0x0d0d0d || pal[0] < 0x404040 ? pal[1] : 0x111111;
  fillAll(img, line);
  const lw = r.range(6, 14), half = lw >> 1;
  const fills = [pal[0], pal[0], pal[0], ...pal.slice(1)];
  const split = (x0, y0, x1, y1, depth) => {
    const w = x1 - x0, h = y1 - y0;
    if (depth === 0 || w < 96 || h < 96 || (depth < 3 && r.chance(250))) {
      const c = r.pick(fills);
      for (let y = Math.max(0, y0 + lw); y < Math.min(W2, y1 - lw); y++) {
        for (let x = Math.max(0, x0 + lw); x < Math.min(W2, x1 - lw); x++) put(img, y * W2 + x, c);
      }
      return;
    }
    if (w > h || (w === h && r.chance(500))) {
      const s = x0 + Math.floor((w * r.range(30, 70)) / 100);
      split(x0, y0, s + half, y1, depth - 1);
      split(s - half, y0, x1, y1, depth - 1);
    } else {
      const s = y0 + Math.floor((h * r.range(30, 70)) / 100);
      split(x0, y0, x1, s + half, depth - 1);
      split(x0, s - half, x1, y1, depth - 1);
    }
  };
  split(-lw, -lw, W2 + lw, W2 + lw, r.range(3, 5));
}

function rings(img, r, pal) {
  const k = r.range(1, 3), w = r.range(10, 28), ncol = r.range(2, 3);
  const cols = [pal[0], contrasting(pal.slice(1), pal[0], r), ...others(pal, r, ncol - 2)];
  const cs = Array.from({ length: k }, () => [r.int(W2), r.int(W2)]);
  for (let y = 0; y < W2; y++) {
    for (let x = 0; x < W2; x++) {
      let s = 0;
      for (const [cx, cy] of cs) s += Math.floor(isqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / w);
      put(img, y * W2 + x, cols[s % ncol]);
    }
  }
}

function waves(img, r, pal) {
  const w = r.range(12, 32), amp = r.range(16, 90), f1 = r.range(1, 4), f2 = r.range(0, 3), ph = r.int(256);
  const ncol = r.range(2, 4);
  const cols = [pal[0], contrasting(pal.slice(1), pal[0], r), ...others(pal, r, ncol - 2)];
  const vertical = r.chance(400);
  for (let y = 0; y < W2; y++) {
    for (let x = 0; x < W2; x++) {
      const [u, v] = vertical ? [y, x] : [x, y];
      const warp = (amp * sin(((u * f1 * 256) / W2 + ph + ((v * f2 * 256) / W2) | 0))) >> 14;
      const band = Math.floor((v + warp + 1024) / w);
      put(img, y * W2 + x, cols[band % ncol]);
    }
  }
}

function contours(img, r, pal) {
  const cell = r.pick([128, 192, 256]), bands = r.range(6, 14), seed = r.u32();
  const ramp = r.chance(300);
  const a = pal[1 + r.int(4)], b = contrasting(pal, a, r);
  for (let y = 0; y < W2; y++) {
    for (let x = 0; x < W2; x++) {
      const k = (fbm(x, y, cell, seed) * bands) >> 16;
      put(img, y * W2 + x, ramp ? mix(b, a, Math.floor((k * 256) / Math.max(1, bands - 1))) : pal[k % 5]);
    }
  }
}

function dctBasis(img, r, pal) {
  const mode = r.weighted([[4, "mosaic"], [4, "quadtree"], [3, "rgb"]]);
  const a = pal[0], b = contrasting(pal.slice(1), a, r);
  const low = r.chance(500);
  const freq = () => (low ? r.int(4) : r.int(8));
  const cell = (x0, y0, s) => {
    const f = mode === "rgb" ? [freq(), freq(), freq(), freq(), freq(), freq()] : [freq(), freq()];
    const flip = r.chance(500);
    const c2 = mode === "quadtree" && r.chance(300) ? contrasting(pal, b, r) : b;
    for (let y = 0; y < s; y++) {
      const ly = Math.floor((y * 8) / s);
      for (let x = 0; x < s; x++) {
        const lx = Math.floor((x * 8) / s), i = (y0 + y) * W2 + x0 + x;
        if (mode === "rgb") {
          for (let c = 0; c < 3; c++) img[i * 3 + c] = clamp8(Math.round(128 + basis(f[2 * c], f[2 * c + 1], lx, ly) * 512));
        } else {
          const val = basis(f[0], f[1], lx, ly);
          put(img, i, mix(a, c2, Math.min(256, Math.max(0, Math.round((flip ? -val : val) * 512 + 128)))));
        }
      }
    }
  };
  if (mode === "quadtree") {
    const split = (x0, y0, s) => {
      if (s > 16 && (s >= 256 || r.chance(s >= 64 ? 650 : 400))) {
        const h = s >> 1;
        split(x0, y0, h); split(x0 + h, y0, h); split(x0, y0 + h, h); split(x0 + h, y0 + h, h);
      } else {
        cell(x0, y0, s);
      }
    };
    split(0, 0, W2);
  } else {
    const s = r.pick([32, 64, 128]);
    for (let gy = 0; gy < W2; gy += s) for (let gx = 0; gx < W2; gx += s) cell(gx, gy, s);
  }
}

const DRAW = {
  "DCT Basis": dctBasis, Spectrum: spectrum, Bitwise: bitwise, Plasma: plasma, Geometry: geometry,
  Rings: rings, Waves: waves, Contours: contours, "Color Field": colorField, Grid: grid,
};

function mosh(img, r, kind) {
  const S = SIZE;
  if (kind === "Slices") {
    for (let n = r.range(5, 16); n > 0; n--) {
      const y0 = r.int(S), h = r.range(2, 28), dx = r.range(-96, 96), swap = r.chance(300);
      for (let y = y0; y < Math.min(S, y0 + h); y++) {
        const row = img.slice(y * S * 3, (y + 1) * S * 3);
        for (let x = 0; x < S; x++) {
          const s = ((((x - dx) % S) + S) % S) * 3, o = (y * S + x) * 3;
          img[o] = row[swap ? s + 1 : s];
          img[o + 1] = row[swap ? s + 2 : s + 1];
          img[o + 2] = row[swap ? s : s + 2];
        }
      }
    }
  } else if (kind === "Shuffle") {
    const b = r.pick([8, 16, 32]), g = S / b, src = img.slice();
    for (let n = r.range(12, 60); n > 0; n--) {
      const fx = r.int(g) * b, fy = r.int(g) * b, tx = r.int(g) * b, ty = r.int(g) * b;
      for (let y = 0; y < b; y++) {
        img.set(src.subarray(((fy + y) * S + fx) * 3, ((fy + y) * S + fx + b) * 3), ((ty + y) * S + tx) * 3);
      }
    }
  } else if (kind === "Smear") {
    for (let n = r.range(1, 3); n > 0; n--) {
      const a0 = r.int(S), w = r.range(16, 128), from = r.range(S >> 2, (3 * S) >> 2);
      if (r.chance(600)) {
        for (let y = from + 1; y < S; y++) {
          for (let x = a0; x < Math.min(S, a0 + w); x++) img.copyWithin((y * S + x) * 3, (from * S + x) * 3, (from * S + x) * 3 + 3);
        }
      } else {
        for (let y = a0; y < Math.min(S, a0 + w); y++) {
          for (let x = from + 1; x < S; x++) img.copyWithin((y * S + x) * 3, (y * S + from) * 3, (y * S + from) * 3 + 3);
        }
      }
    }
  }
}

function boxDown(img, W, f) {
  const sw = Math.ceil(W / f);
  const small = new Uint8Array(sw * sw * 3);
  for (let sy = 0; sy < sw; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0, n = 0;
        for (let y = sy * f; y < Math.min(W, sy * f + f); y++) {
          for (let x = sx * f; x < Math.min(W, sx * f + f); x++) { sum += img[(y * W + x) * 3 + c]; n++; }
        }
        small[(sy * sw + sx) * 3 + c] = Math.floor((sum + (n >> 1)) / n);
      }
    }
  }
  return { small, sw };
}

function smoothUp(img, small, sw, f) {
  const coord = (x) => {
    const u = Math.floor(((2 * x + 1) * 256) / (2 * f)) - 128;
    const i = u >> 8;
    return [Math.min(sw - 1, Math.max(0, i)), Math.min(sw - 1, Math.max(0, i + 1)), u & 255];
  };
  for (let y = 0; y < SIZE; y++) {
    const [y0, y1, wy] = coord(y);
    for (let x = 0; x < SIZE; x++) {
      const [x0, x1, wx] = coord(x);
      for (let c = 0; c < 3; c++) {
        const a = small[(y0 * sw + x0) * 3 + c], b = small[(y0 * sw + x1) * 3 + c];
        const d = small[(y1 * sw + x0) * 3 + c], e = small[(y1 * sw + x1) * 3 + c];
        img[(y * SIZE + x) * 3 + c] =
          (a * (256 - wx) * (256 - wy) + b * wx * (256 - wy) + d * (256 - wx) * wy + e * wx * wy + 32768) >> 16;
      }
    }
  }
}

function saturate(img, k8) {
  for (let i = 0; i < img.length; i += 3) {
    const y = (19595 * img[i] + 38470 * img[i + 1] + 7471 * img[i + 2] + 32768) >> 16;
    for (let c = 0; c < 3; c++) img[i + c] = clamp8(y + (((img[i + c] - y) * k8) >> 3));
  }
}

function contrast(img, k8) {
  for (let i = 0; i < img.length; i++) img[i] = clamp8(128 + (((img[i] - 128) * k8) >> 3));
}

function sharpen(img, a) {
  const src = img.slice();
  const at = (x, y, c) => src[(Math.min(SIZE - 1, Math.max(0, y)) * SIZE + Math.min(SIZE - 1, Math.max(0, x))) * 3 + c];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      for (let c = 0; c < 3; c++) {
        const v = at(x, y, c);
        const lap = 4 * v - at(x - 1, y, c) - at(x + 1, y, c) - at(x, y - 1, c) - at(x, y + 1, c);
        img[(y * SIZE + x) * 3 + c] = clamp8(v + ((lap * a) >> 3));
      }
    }
  }
}

function fry(img, level) {
  if (level >= 1) {
    saturate(img, 12);
    contrast(img, 10);
    sharpen(img, 2);
  }
  if (level >= 2) {
    saturate(img, 14);
    contrast(img, 11);
    sharpen(img, 4);
  }
}

const DCT = new Float64Array([
  0.35355339059327379, 0.35355339059327379, 0.35355339059327379, 0.35355339059327379, 0.35355339059327379, 0.35355339059327379, 0.35355339059327379, 0.35355339059327379,
  0.49039264020161522, 0.41573480615127262, 0.27778511650980114, 0.097545161008064166, -0.097545161008064096, -0.27778511650980098, -0.41573480615127267, -0.49039264020161522,
  0.46193976625564337, 0.19134171618254492, -0.19134171618254486, -0.46193976625564337, -0.46193976625564342, -0.19134171618254517, 0.19134171618254500, 0.46193976625564326,
  0.41573480615127262, -0.097545161008064096, -0.49039264020161522, -0.27778511650980109, 0.27778511650980092, 0.49039264020161522, 0.097545161008064388, -0.41573480615127256,
  0.35355339059327379, -0.35355339059327373, -0.35355339059327384, 0.35355339059327368, 0.35355339059327384, -0.35355339059327334, -0.35355339059327356, 0.35355339059327329,
  0.27778511650980114, -0.49039264020161522, 0.097545161008064152, 0.41573480615127278, -0.41573480615127256, -0.097545161008064013, 0.49039264020161533, -0.27778511650980076,
  0.19134171618254492, -0.46193976625564342, 0.46193976625564326, -0.19134171618254495, -0.19134171618254528, 0.46193976625564337, -0.46193976625564320, 0.19134171618254478,
  0.097545161008064166, -0.27778511650980109, 0.41573480615127278, -0.49039264020161533, 0.49039264020161522, -0.41573480615127251, 0.27778511650980076, -0.097545161008064291,
]);

const Q_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const Q_CHROMA = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  ...new Array(32).fill(99),
];

function qtable(base, quality) {
  const s = quality < 50 ? Math.floor(5000 / quality) : 200 - quality * 2;
  return Float64Array.from(base, (b) => Math.min(255, Math.max(1, Math.floor((b * s + 50) / 100))));
}

const blk = new Float64Array(64), tmp = new Float64Array(64), coef = new Float64Array(64);
const cur = new Float64Array(64), prev = new Float64Array(64);

function planeRoundTrip(p, pw, ph, qt, ox, oy, glitch) {
  prev.fill(0);
  for (let by = -oy; by < ph; by += 8) {
    for (let bx = -ox; bx < pw; bx += 8) {
      for (let y = 0; y < 8; y++) {
        const sy = Math.min(ph - 1, Math.max(0, by + y));
        for (let x = 0; x < 8; x++) blk[y * 8 + x] = p[sy * pw + Math.min(pw - 1, Math.max(0, bx + x))] - 128;
      }
      for (let u = 0; u < 8; u++) {
        for (let x = 0; x < 8; x++) {
          let s = 0;
          for (let y = 0; y < 8; y++) s += DCT[u * 8 + y] * blk[y * 8 + x];
          tmp[u * 8 + x] = s;
        }
      }
      for (let u = 0; u < 8; u++) {
        for (let v = 0; v < 8; v++) {
          let s = 0;
          for (let x = 0; x < 8; x++) s += tmp[u * 8 + x] * DCT[v * 8 + x];
          coef[u * 8 + v] = Math.round(s / qt[u * 8 + v]);
        }
      }
      if (glitch) {
        cur.set(coef);
        if (glitch.r.chance(glitch.p)) corrupt(glitch.r);
        prev.set(cur);
      }
      for (let i = 0; i < 64; i++) coef[i] *= qt[i];
      for (let y = 0; y < 8; y++) {
        for (let v = 0; v < 8; v++) {
          let s = 0;
          for (let u = 0; u < 8; u++) s += DCT[u * 8 + y] * coef[u * 8 + v];
          tmp[y * 8 + v] = s;
        }
      }
      for (let y = 0; y < 8; y++) {
        const py = by + y;
        if (py < 0 || py >= ph) continue;
        for (let x = 0; x < 8; x++) {
          const px = bx + x;
          if (px < 0 || px >= pw) continue;
          let s = 0;
          for (let v = 0; v < 8; v++) s += tmp[y * 8 + v] * DCT[v * 8 + x];
          p[py * pw + px] = clamp8(Math.round(s + 128));
        }
      }
    }
  }
}

function corrupt(r) {
  switch (r.int(6)) {
    case 4:
      coef.set(prev);
      break;
    case 5:
      coef.fill(0, 1);
      break;
    case 0:
      for (let i = 1; i < 64; i++) coef[i] *= 3;
      break;
    case 1:
      coef[0] += r.range(-6, 6);
      break;
    case 2:
      for (let u = 0; u < 8; u++) for (let v = u + 1; v < 8; v++) { const t = coef[u * 8 + v]; coef[u * 8 + v] = coef[v * 8 + u]; coef[v * 8 + u] = t; }
      break;
    case 3:
      coef[r.int(64)] += r.range(-4, 4);
      break;
  }
}

function jpegRoundTrip(img, W, quality, sub, ox, oy, glitch, shift) {
  const n = W * W;
  const Y = new Uint8Array(n), Cb = new Uint8Array(n), Cr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = img[i * 3], g = img[i * 3 + 1], b = img[i * 3 + 2];
    Y[i] = (19595 * r + 38470 * g + 7471 * b + 32768) >> 16;
    Cb[i] = (-11059 * r - 21709 * g + 32768 * b + 8421375) >> 16;
    Cr[i] = (32768 * r - 27439 * g - 5329 * b + 8421375) >> 16;
  }
  planeRoundTrip(Y, W, W, qtable(Q_LUMA, quality), ox, oy, glitch);

  const cw = Math.ceil(W / sub);
  const qc = qtable(Q_CHROMA, quality);
  for (const [P, dx] of [[Cb, shift], [Cr, -shift]]) {
    const small = new Uint8Array(cw * cw);
    for (let sy = 0; sy < cw; sy++) {
      for (let sx = 0; sx < cw; sx++) {
        let sum = 0, k = 0;
        for (let y = sy * sub; y < Math.min(W, sy * sub + sub); y++) {
          for (let x = sx * sub; x < Math.min(W, sx * sub + sub); x++) { sum += P[y * W + x]; k++; }
        }
        small[sy * cw + sx] = Math.floor((sum + (k >> 1)) / k);
      }
    }
    planeRoundTrip(small, cw, cw, qc, Math.floor(ox / sub), Math.floor(oy / sub), glitch);
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const sx = Math.min(W - 1, Math.max(0, x + dx));
        P[y * W + x] = small[Math.floor(y / sub) * cw + Math.floor(sx / sub)];
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const y = Y[i], cb = Cb[i] - 128, cr = Cr[i] - 128;
    img[i * 3] = clamp8(y + ((91881 * cr + 32768) >> 16));
    img[i * 3 + 1] = clamp8(y + ((-22554 * cb - 46802 * cr + 32768) >> 16));
    img[i * 3 + 2] = clamp8(y + ((116130 * cb + 32768) >> 16));
  }
}

export function traits(seed) {
  return pickTraits(seed).t;
}

function pickTraits(seed) {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) throw new Error("seed must be 32 bytes");
  const rt = stream(seed, "traits");
  const composition = rt.weighted(COMPOSITIONS);
  const [paletteName, palette] = rt.weighted(PALETTES);
  const tier = rt.weighted(TIERS);
  const glitch = rt.weighted(GLITCH);
  const chroma = rt.weighted(CHROMA);
  const overlay = rt.weighted(OVERLAY);
  let layer = "—";
  if (overlay !== "None") {
    do layer = rt.weighted(COMPOSITIONS); while (layer === composition);
  }
  const moshKind = rt.weighted(MOSH);

  const rs = stream(seed, "genloss");
  const plan = [];
  for (let i = rs.range(tier.rounds[0], tier.rounds[1]); i > 0; i--) {
    const reup = rs.chance(tier.reup);
    plan.push({ q: rs.range(tier.q[0], tier.q[1]), f: reup ? rs.range(tier.f[0], tier.f[1]) : 1, ox: rs.int(8), oy: rs.int(8) });
  }
  const t = {
    composition,
    palette: paletteName,
    compression: tier.name,
    overlay,
    layer,
    glitch,
    chroma,
    mosh: moshKind,
    generations: plan.length,
    quality: plan.length ? Math.round(plan.reduce((s, p) => s + p.q, 0) / plan.length) : 100,
  };
  return { t, palette, tier, plan, rs };
}

export function generate(seed, onStage) {
  const { t, palette, tier, plan, rs } = pickTraits(seed);

  const big = new Uint8Array(W2 * W2 * 3);
  DRAW[t.composition](big, stream(seed, "composition"), palette);
  if (t.overlay !== "None") {
    const top = new Uint8Array(W2 * W2 * 3);
    DRAW[t.layer](top, stream(seed, "layer"), palette);
    const xor = t.overlay === "XOR";
    for (let i = 0; i < big.length; i++) big[i] = xor ? big[i] ^ top[i] : Math.abs(big[i] - top[i]);
  }
  const img = boxDown(big, W2, 2).small;
  onStage?.(img, 0);

  const rg = stream(seed, "glitch");
  const rm = stream(seed, "mosh");
  const passes = plan.length ? plan : t.glitch !== "None" || t.chroma !== "Aligned" ? [{ q: 92, f: 1, ox: 0, oy: 0 }] : [];
  const moshAt = passes.length ? passes.length >> 1 : -1;
  const shift = t.chroma === "Shifted" ? rg.range(2, 6) : 0;
  const glitch = GLITCH_P[t.glitch] ? { r: rg, p: GLITCH_P[t.glitch] } : null;

  fry(img, tier.fry);
  passes.forEach((p, i) => {
    if (p.f > 1) {
      const { small, sw } = boxDown(img, SIZE, p.f);
      jpegRoundTrip(small, sw, p.q, tier.sub, p.ox, p.oy, glitch, Math.max(1, shift >> 1) * (shift ? 1 : 0));
      smoothUp(img, small, sw, p.f);
    } else {
      jpegRoundTrip(img, SIZE, p.q, tier.sub, p.ox, p.oy, glitch, shift);
    }
    if (tier.fry === 2 && i === passes.length >> 1) fry(img, 1);
    if (i === moshAt && t.mosh !== "None") mosh(img, rm, t.mosh);
    if (i < passes.length - 1) onStage?.(img, i + 1);
  });
  if (moshAt < 0 && t.mosh !== "None") mosh(img, rm, t.mosh);
  if (tier.fry === 2) { saturate(img, 16); contrast(img, 9); }
  if (passes.length) onStage?.(img, passes.length);

  return { size: SIZE, rgb: img, traits: t };
}

export function toRGBA(rgb) {
  const out = new Uint8ClampedArray((rgb.length / 3) * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    out[j] = rgb[i];
    out[j + 1] = rgb[i + 1];
    out[j + 2] = rgb[i + 2];
    out[j + 3] = 255;
  }
  return out;
}
