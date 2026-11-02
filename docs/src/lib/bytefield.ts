import { decodeCollection, type Collection } from "@gl-36/sdk";
import { HEADER_LEN, SLOT_LEN, headerField, type Field } from "./layout";

const COLS = SLOT_LEN;
const HEADER_ROWS = Math.ceil(HEADER_LEN / COLS);

export type Hover =
  | { kind: "header"; field: Field; offset: number }
  | { kind: "slot"; id: number; part: "owner" | "price" }
  | { kind: "free"; id: number };

interface Options {
  mode: "fill" | "content";
  spare?: number;
  minCell?: number;
  onHover?: (h: Hover | null, col: Collection | null) => void;
}

type Cell = { byte: number } | { pad: true } | { free: number };

export class ByteField {
  private ctx: CanvasRenderingContext2D;
  private data: Uint8Array | null = null;
  private col: Collection | null = null;
  private rows = 0;
  private cell = 0;
  private dpr = 1;
  private born: number[] = [];
  private hover: { r: number; c: number } | null = null;
  private raf = 0;
  private last = 0;
  private level = new Float32Array(0);
  private ink = "#fff";
  private inkLit = "#fff";
  private still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: Options,
  ) {
    this.ctx = canvas.getContext("2d")!;
    new ResizeObserver(() => this.layout()).observe(canvas.parentElement ?? canvas);
    const repaint = () => {
      this.readInk();
      cancelAnimationFrame(this.raf);
      this.frame(performance.now());
    };
    window.addEventListener("gl36:theme", repaint);
    canvas.addEventListener("pointermove", (e) => this.point(e));
    canvas.addEventListener("pointerdown", (e) => this.point(e));
    canvas.addEventListener("pointerleave", () => this.setHover(null));
    this.readInk();
    this.layout();
  }

  set(data: Uint8Array) {
    const prevRows = this.data ? this.usedRows(this.data) : 0;
    this.data = data;
    this.col = decodeCollection(data);
    const now = performance.now();
    const total = this.usedRows(data);
    for (let r = prevRows; r < total; r++) this.born[r] = this.still ? 0 : now + (r - prevRows) * 26;
    this.layout();
  }

  private usedRows(d: Uint8Array) {
    return HEADER_ROWS + Math.max(0, (d.length - HEADER_LEN) / SLOT_LEN);
  }

  private readInk() {
    const css = getComputedStyle(this.canvas);
    this.ink = css.color || "#fff";
    this.inkLit = css.getPropertyValue("--ink-lit").trim() || this.ink;
  }

  private layout() {
    const box = this.canvas.parentElement!.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width));
    this.cell = Math.max(w / COLS, this.opts.minCell ?? 0);
    if (this.opts.mode === "fill") {
      this.rows = Math.ceil(box.height / this.cell);
    } else {
      this.rows = (this.data ? this.usedRows(this.data) : HEADER_ROWS) + (this.opts.spare ?? 2);
      this.canvas.style.height = `${Math.round(this.rows * this.cell)}px`;
    }
    const h = this.opts.mode === "fill" ? box.height : this.rows * this.cell;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    if (this.level.length !== this.rows * COLS) this.level = new Float32Array(this.rows * COLS).fill(1);
    this.paint();
  }

  private at(r: number, c: number): Cell {
    if (r < HEADER_ROWS) {
      const i = r * COLS + c;
      return i < HEADER_LEN ? { byte: i } : { pad: true };
    }
    const id = r - HEADER_ROWS;
    const i = HEADER_LEN + id * SLOT_LEN + c;
    return this.data && i < this.data.length ? { byte: i } : { free: id };
  }

  private hit(r: number, c: number): Hover | null {
    const cell = this.at(r, c);
    if ("pad" in cell) return null;
    if ("free" in cell) return { kind: "free", id: cell.free };
    if (cell.byte < HEADER_LEN) {
      const field = headerField(cell.byte);
      return field ? { kind: "header", field, offset: cell.byte } : null;
    }
    return { kind: "slot", id: r - HEADER_ROWS, part: c < 32 ? "owner" : "price" };
  }

  private point(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / this.cell);
    const r = Math.floor((e.clientY - rect.top) / this.cell);
    this.setHover(c >= 0 && c < COLS && r >= 0 && r < this.rows ? { r, c } : null);
  }

  private setHover(h: { r: number; c: number } | null) {
    const a = this.hover ? this.hit(this.hover.r, this.hover.c) : null;
    const b = h ? this.hit(h.r, h.c) : null;
    this.hover = b ? h : null;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      this.opts.onHover?.(b, this.col);
      this.paint();
    }
  }

  private lit(r: number, c: number, h: Hover): boolean {
    const cell = this.at(r, c);
    if (h.kind === "header") return "byte" in cell && cell.byte >= h.field.off && cell.byte < h.field.off + h.field.len;
    if (h.kind === "slot") return r - HEADER_ROWS === h.id;
    return "free" in cell && cell.free === h.id;
  }

  private paint = () => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    const { ctx, cell, dpr } = this;
    const dt = this.last ? Math.min(64, now - this.last) : 16;
    this.last = now;
    const ease = this.still ? 1 : 1 - Math.exp(-dt / 70);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = this.ink;
    let fill = this.ink;
    const h = this.hover ? this.hit(this.hover.r, this.hover.c) : null;
    let moving = false;

    for (let r = 0; r < this.rows; r++) {
      const t = this.data ? Math.min(1, Math.max(0, (now - (this.born[r] ?? 0)) / 520)) : 0;
      if (t < 1 && this.data && r < this.usedRows(this.data)) moving = true;
      const grow = 1 - Math.pow(1 - t, 3);
      for (let c = 0; c < COLS; c++) {
        const k = this.at(r, c);
        if ("pad" in k) continue;
        let size: number;
        let alpha: number;
        if ("free" in k || !this.data) {
          size = cell * 0.1;
          alpha = 0.22;
        } else {
          const v = this.data[k.byte];
          size = cell * (0.14 + 0.68 * Math.sqrt(v / 255)) * grow;
          alpha = 1;
        }
        const on = !!h && this.lit(r, c, h);
        const target = h ? (on ? 1.12 : 0.28) : 1;
        const want = on ? this.inkLit : this.ink;
        if (want !== fill) ctx.fillStyle = fill = want;
        const i = r * COLS + c;
        const lv = (this.level[i] += (target - this.level[i]) * ease);
        if (Math.abs(target - lv) > 0.004) moving = true;
        alpha *= Math.min(1, lv);
        if (lv > 1) size *= lv;
        if (size < 0.5) continue;
        ctx.globalAlpha = alpha;
        const x = c * cell + (cell - size) / 2;
        const y = r * cell + (cell - size) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, size, size, size * 0.3);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (moving) this.raf = requestAnimationFrame(this.frame);
    else this.last = 0;
  };
}

export function sampleAccount(minted = 12): Uint8Array {
  let s = 0x9e3779b9;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) & 0xff;
  };
  const d = new Uint8Array(HEADER_LEN + minted * SLOT_LEN);
  const v = new DataView(d.buffer);
  d[0] = 1;
  d[1] = 1;
  d[2] = 254;
  v.setUint16(4, 5000, true);
  v.setUint16(6, minted, true);
  v.setUint16(8, 200, true);
  v.setUint32(12, 0x47454e31, true);
  v.setBigUint64(16, 10_000_000n, true);
  const fill = (off: number, len: number) => {
    for (let i = 0; i < len; i++) d[off + i] = rnd();
  };
  fill(24, 32);
  fill(56, 32);
  fill(184, 32);
  const owners = [0, 1, 2].map(() => Array.from({ length: 32 }, rnd));
  for (let id = 0; id < minted; id++) {
    const o = HEADER_LEN + id * SLOT_LEN;
    d.set(owners[id % 3], o);
    if (id % 4 === 1) v.setUint32(o + 32, 20_000 + id * 3_000, true);
  }
  return d;
}
