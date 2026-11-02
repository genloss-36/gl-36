type Traits = Record<string, string | number>;
type Rnd = () => number;

function mulberry(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: Rnd, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const between = (r: Rnd, [lo, hi]: readonly [number, number]) => lo + Math.floor(r() * (hi - lo + 1));
function weighted<T>(r: Rnd, options: readonly (readonly [number, T])[]): T {
  let x = r() * options.reduce((s, [w]) => s + w, 0);
  for (const [w, v] of options) if ((x -= w) < 0) return v;
  return options[options.length - 1][1];
}

const MODES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11],
} as const;
type Mode = keyof typeof MODES;
const PALETTE_MODES: Record<string, Mode[]> = {
  Rothko: ["aeolian", "dorian"], Noir: ["aeolian", "dorian"], Mono: ["dorian", "aeolian"],
  Acid: ["dorian", "mixolydian"], Solana: ["dorian", "lydian"], Vapor: ["lydian", "dorian"],
  Bauhaus: ["ionian", "mixolydian"], Earth: ["dorian", "mixolydian"], Ice: ["lydian", "aeolian"],
  Candy: ["ionian", "lydian"], Ink: ["dorian", "ionian"],
};
const CUTOFF: Record<string, number> = {
  Lossless: 9000, Compressed: 6500, Crushed: 4800, Mangled: 3600, "Deep Fried": 2800, Legendary: 1700,
};
const STUTTER: Record<string, number> = { None: 0, Light: 0.04, Heavy: 0.09, Total: 0.16 };

const PROGRESSIONS = [[0, 5, 3, 4], [0, 3, 5, 4], [0, 4, 5, 3], [5, 3, 0, 4], [0, 5], [0, 3], [0, 1], [0, -1, -2, -1], [0, 2, 3, 5], [0, 0, 5, 5], [3, 4, 0, 0]];
const DRONE_PROGRESSIONS = [[0], [0, 5], [0, -2], [0, 3]];
const VOICINGS = [[0, 2, 4, 6], [0, 2, 4, 8], [0, 4, 7, 9], [0, 2, 4], [0, 4, 7, 11]];

type Style = "drift" | "drone" | "haze" | "lattice" | "chime" | "broken";
type Pad = "glass" | "warm" | "hollow" | "choir";
type Lead = "bell" | "celesta" | "flute" | "pluck";
type Kit = "half" | "four" | "broken" | "light";

interface StyleSpec {
  bpm: [number, number];
  root: [number, number];
  chordBars: number[];
  pads: Pad[];
  kits: Kit[];
  bass: string[];
  arp: number;
  motif: number;
  leads: Lead[];
  bells: number;
  verb: number;
  drone?: boolean;
}

const STYLES: Record<Style, StyleSpec> = {
  drift: { bpm: [60, 74], root: [50, 57], chordBars: [2, 4], pads: ["glass", "choir", "warm"], kits: [], bass: [], arp: 0.2, motif: 0.6, leads: ["flute", "bell"], bells: 0.12, verb: 0.75 },
  drone: { bpm: [50, 62], root: [46, 52], chordBars: [4], pads: ["warm", "hollow"], kits: [], bass: [], arp: 0, motif: 0.3, leads: ["flute", "bell"], bells: 0.06, verb: 0.9, drone: true },
  haze: { bpm: [84, 100], root: [48, 55], chordBars: [2], pads: ["warm", "choir", "glass"], kits: ["half", "broken"], bass: ["r-----r-.r------", "r-------f-----o-", "r--.....r-.f-..."], arp: 0.35, motif: 0.7, leads: ["pluck", "flute", "bell"], bells: 0.05, verb: 0.55 },
  lattice: { bpm: [108, 124], root: [47, 54], chordBars: [1, 2], pads: ["hollow", "glass"], kits: ["four", "half"], bass: ["r.r.r.r.r.r.r.r.", "r..r..r.r..r..o.", "r-.r-.r-.f-.o-.."], arp: 1, motif: 0.35, leads: ["pluck", "celesta"], bells: 0.03, verb: 0.4 },
  chime: { bpm: [76, 92], root: [52, 59], chordBars: [2], pads: ["glass", "warm"], kits: ["light"], bass: ["r-------r-------", "r-----f-r-----o-"], arp: 0.25, motif: 1, leads: ["celesta", "bell"], bells: 0.03, verb: 0.6 },
  broken: { bpm: [90, 104], root: [45, 52], chordBars: [2, 4], pads: ["warm", "hollow"], kits: ["broken"], bass: ["r--r------f-----", "r-----.r--o-r---", "r.....r...r.o..."], arp: 0.4, motif: 0.45, leads: ["pluck", "bell"], bells: 0.05, verb: 0.5 },
};

const STYLE_BY_COMPOSITION: Record<string, [number, Style][]> = {
  "DCT Basis": [[2, "chime"], [1, "lattice"], [1, "broken"], [1, "haze"]],
  Spectrum: [[2, "lattice"], [2, "haze"], [1, "drift"]],
  Bitwise: [[3, "lattice"], [1, "broken"]],
  Plasma: [[3, "haze"], [1, "drift"], [1, "broken"]],
  Geometry: [[2, "broken"], [1, "haze"], [1, "chime"]],
  Rings: [[3, "chime"], [1, "drift"]],
  Waves: [[2, "drift"], [2, "haze"]],
  Contours: [[3, "drone"], [1, "drift"]],
  "Color Field": [[2, "drift"], [2, "drone"], [1, "chime"]],
  Grid: [[2, "lattice"], [2, "broken"]],
};
const AMBIENT: [number, Style][] = [[3, "drift"], [1, "chime"]];

const KITS: Record<Kit, { kick: string[]; snare: string[]; hat: string[]; tick: string[] }> = {
  half: { kick: ["9.........7.....", "9......6..7....."], snare: ["........8......."], hat: ["..4...4...4...4.", "3.2.4.2.3.2.4.2."], tick: [""] },
  four: { kick: ["9...8...9...8..."], snare: ["....3.......3...", ""], hat: ["..5...5...5...5.", "..5..25...5..25."], tick: [""] },
  broken: { kick: ["9..6......8..5..", "9.....7...7....."], snare: ["....8.......8..3", "....8..2....8..."], hat: ["3231323132313231", "3.23.23.3.23.23."], tick: [""] },
  light: { kick: ["7.......5.......", "7.........5....."], snare: [""], hat: [""], tick: ["....5.......5...", "..4...4...4...4."] },
};

const PADS: Record<Pad, { osc: [OscillatorType, number, number][]; level: number; open: number; vibrato?: number }> = {
  glass: { osc: [["sine", -5, 0], ["triangle", 6, 0]], level: 0.05, open: 2.4 },
  warm: { osc: [["sawtooth", -9, 0], ["sawtooth", 8, 0]], level: 0.03, open: 1.8 },
  hollow: { osc: [["square", -6, 0], ["triangle", 7, -1200]], level: 0.03, open: 1.6 },
  choir: { osc: [["triangle", -4, 0], ["sine", 5, 1200]], level: 0.045, open: 2, vibrato: 6 },
};
const LEAD_OCTAVE: Record<Lead, number> = { bell: 12, celesta: 24, flute: 12, pluck: 12 };
const ARP_ORDERS = [[0, 1, 2, 3], [0, 1, 2, 3, 2, 1], [3, 2, 1, 0], [0, 2, 1, 3]];

function makeMotif(r: Rnd, slots: number): (number | null)[] {
  const notes: (number | null)[] = [];
  let d = pick(r, [0, 2, 4, 7]);
  for (let k = 0; k < slots; k++) {
    if (k === 0 || r() < (k % 2 === 0 ? 0.55 : 0.3)) {
      notes.push(d);
      d = Math.max(-2, Math.min(9, d + pick(r, [-3, -2, -1, -1, 1, 1, 2, 3])));
    } else notes.push(null);
  }
  return notes;
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

interface Song {
  style: Style;
  bpm: number;
  root: number;
  scale: readonly number[];
  chords: number[];
  chordBars: number;
  voicing: number[];
  pad: Pad;
  padCut: number;
  kit: { kick: string; snare: string; hat: string; tick: string } | null;
  bass: string | null;
  arp: { order: number[]; rate: number; wave: OscillatorType; cut: number } | null;
  motif: { notes: (number | null)[]; slot: number; lead: Lead } | null;
  bells: number;
  drone: boolean;
  verb: number;
  swing: number;
  stutter: number;
  cutoff: number;
  bend: boolean;
  wow: number;
  width: number;
  echo: number;
}

interface Layers { beat: boolean; bass: boolean; arp: boolean; motif: boolean }

export class Engine {
  private ctx: BaseAudioContext | null = null;
  private out!: GainNode;
  private bus!: GainNode;
  private drums!: GainNode;
  private tone!: BiquadFilterNode;
  private verbSend!: GainNode;
  private delaySend!: GainNode;
  private echo!: DelayNode;
  private wowDepth!: GainNode;
  private analyser!: AnalyserNode;
  private noise!: AudioBuffer;
  private timer: ReturnType<typeof setInterval> | undefined;
  private starting: Promise<void> | null = null;
  private wanted = false;
  private rnd = mulberry(7);
  private song!: Song;
  private layers: Layers = { beat: false, bass: false, arp: false, motif: false };
  private step = 0;
  private nextTime = 0;
  private pads: { osc: { o: OscillatorNode; base: number }[] }[] = [];
  private held: GainNode[] = [];
  volume = 0.34;

  get running() {
    return !!this.timer;
  }

  async start() {
    this.wanted = true;
    if (this.timer) return;
    this.starting ??= (async () => {
      if (!this.ctx) this.build();
      const ctx = this.ctx as AudioContext;
      await ctx.resume();
      if (this.timer || !this.wanted) return;
      this.out.gain.cancelScheduledValues(ctx.currentTime);
      this.out.gain.setTargetAtTime(this.volume, ctx.currentTime, 1.2);
      this.nextTime = ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 40);
    })().finally(() => { this.starting = null; });
    return this.starting;
  }

  stop() {
    this.wanted = false;
    if (!this.ctx || !this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  setSeed(seed: Uint8Array, traits?: Traits) {
    const r = (this.rnd = mulberry((seed[0] | (seed[1] << 8) | (seed[2] << 16) | (seed[3] << 24)) >>> 0));
    const t = traits ?? {};
    const style = weighted(r, STYLE_BY_COMPOSITION[String(t.composition)] ?? AMBIENT);
    const spec = STYLES[style];
    const kit = spec.kits.length ? KITS[pick(r, spec.kits)] : null;
    const moshed = t.mosh !== undefined && t.mosh !== "None";
    const motifSlot = spec.kits.length ? 2 : 4;
    this.song = {
      style,
      bpm: between(r, spec.bpm),
      root: between(r, spec.root),
      scale: MODES[pick(r, PALETTE_MODES[String(t.palette)] ?? ["dorian", "lydian", "aeolian"])],
      chords: pick(r, spec.drone ? DRONE_PROGRESSIONS : PROGRESSIONS),
      chordBars: pick(r, spec.chordBars),
      voicing: pick(r, VOICINGS),
      pad: pick(r, spec.pads),
      padCut: between(r, [500, 900]),
      kit: kit && { kick: pick(r, kit.kick), snare: pick(r, kit.snare), hat: pick(r, kit.hat), tick: pick(r, kit.tick) },
      bass: spec.bass.length ? pick(r, spec.bass) : null,
      arp: r() < spec.arp ? {
        order: r() < 0.3 ? Array.from({ length: 8 }, () => Math.floor(r() * 4)) : pick(r, ARP_ORDERS),
        rate: style === "lattice" ? 1 : pick(r, [1, 2]),
        wave: t.overlay === "XOR" ? "square" : t.overlay === "Difference" ? "sawtooth" : pick(r, ["square", "sawtooth", "triangle"] as const),
        cut: between(r, [700, 1500]),
      } : null,
      motif: r() < spec.motif ? { notes: makeMotif(r, (pick(r, [1, 2]) * 16) / motifSlot), slot: motifSlot, lead: pick(r, spec.leads) } : null,
      bells: spec.bells,
      drone: !!spec.drone,
      verb: spec.verb,
      swing: kit ? pick(r, [0, 0, 0.18, 0.3]) : 0,
      stutter: STUTTER[String(t.glitch ?? "None")] ?? 0,
      cutoff: CUTOFF[String(t.compression ?? "Compressed")] ?? 6500,
      bend: moshed,
      wow: Math.min(0.0035, 0.0006 + Number(t.generations ?? 0) * 0.0001 + (moshed ? 0.0008 : 0)),
      width: t.chroma === "Shifted" ? 1 : 0.55,
      echo: pick(r, [0.75, 0.5, 1, 1.5]),
    };
    const s = this.song;
    this.layers = { beat: false, bass: false, arp: !!s.arp && !s.motif, motif: !!s.motif };
    if (this.ctx) this.voice(1);
  }

  retune(seed: Uint8Array | null, traits?: Traits) {
    this.setSeed(seed ?? crypto.getRandomValues(new Uint8Array(4)), traits);
    this.step = 0;
    if (!this.ctx || !this.timer) return;
    const now = this.ctx.currentTime;
    for (const p of this.pads) for (const { o, base } of p.osc) o.detune.setTargetAtTime(base - 700, now, 0.35);
    for (const g of this.held) {
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, 0.3);
    }
    this.nextTime = now + 0.9;
    const s = this.song;
    [0, 2, 4, 7].forEach((d, k) =>
      this.bell(this.nextTime + k * 0.16, s.root + 12 + s.scale[d % 7] + 12 * Math.floor(d / 7), 0.045 - k * 0.006));
  }

  level(): number {
    if (!this.ctx || !this.timer) return 0;
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += (v - 128) * (v - 128);
    return Math.min(1, Math.sqrt(sum / buf.length) / 30);
  }

  private build(ctx: BaseAudioContext = new AudioContext({ latencyHint: "playback" })) {
    this.ctx = ctx;
    this.out = new GainNode(ctx, { gain: 0 });
    this.analyser = new AnalyserNode(ctx, { fftSize: 1024 });
    const comp = new DynamicsCompressorNode(ctx, { threshold: -20, ratio: 3, attack: 0.02, release: 0.4, knee: 12 });
    this.tone = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 6500, Q: 0.5 });
    const air = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 5000, gain: -6 });
    this.bus = new GainNode(ctx, { gain: 0.9 });

    const tape = new DelayNode(ctx, { delayTime: 0.03, maxDelayTime: 0.1 });
    const wow = new OscillatorNode(ctx, { frequency: 0.43 });
    const flutter = new OscillatorNode(ctx, { frequency: 6.3 });
    this.wowDepth = new GainNode(ctx, { gain: 0.001 });
    wow.connect(this.wowDepth).connect(tape.delayTime);
    flutter.connect(new GainNode(ctx, { gain: 0.00005 })).connect(tape.delayTime);
    wow.start();
    flutter.start();

    const len = Math.floor(ctx.sampleRate * 5.5);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += ((Math.random() * 2 - 1) - lp) * 0.18;
        d[i] = lp * Math.pow(1 - i / len, 3.2) * 2.2;
      }
    }
    const verb = new ConvolverNode(ctx, { buffer: ir });
    this.verbSend = new GainNode(ctx, { gain: 0.6 });
    this.verbSend.connect(verb).connect(this.bus);

    this.echo = new DelayNode(ctx, { delayTime: 0.42, maxDelayTime: 2 });
    const fb = new GainNode(ctx, { gain: 0.32 });
    const dark = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 2200 });
    const pan = new StereoPannerNode(ctx, { pan: -0.35 });
    this.delaySend = new GainNode(ctx, { gain: 0.3 });
    this.delaySend.connect(this.echo).connect(dark).connect(fb).connect(this.echo);
    dark.connect(pan).connect(this.bus);

    this.drums = new GainNode(ctx, { gain: 1 });
    this.drums.connect(new BiquadFilterNode(ctx, { type: "lowpass", frequency: 8000, Q: 0.4 })).connect(this.bus);

    this.bus.connect(tape).connect(this.tone).connect(air).connect(comp).connect(this.analyser).connect(this.out).connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const hiss = new AudioBufferSourceNode(ctx, { buffer: this.noise, loop: true });
    const hissLp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 900 });
    const hissGain = new GainNode(ctx, { gain: 0.012 });
    const breath = new OscillatorNode(ctx, { frequency: 0.07 });
    const breathDepth = new GainNode(ctx, { gain: 0.006 });
    breath.connect(breathDepth).connect(hissGain.gain);
    hiss.connect(hissLp).connect(hissGain).connect(this.bus);
    hiss.start();
    breath.start();

    if (this.song) this.voice(0.01);
    else this.setSeed(crypto.getRandomValues(new Uint8Array(4)));
  }

  private voice(glide: number) {
    const s = this.song, now = this.ctx!.currentTime;
    this.tone.frequency.setTargetAtTime(s.cutoff, now, 1.5 * glide);
    this.verbSend.gain.setTargetAtTime(s.verb, now, glide);
    this.echo.delayTime.setTargetAtTime(Math.min(1.9, (s.echo * 60) / s.bpm), now, 0.5 * glide);
    this.wowDepth.gain.setTargetAtTime(s.wow, now, glide);
  }

  private schedule(horizon = this.ctx!.currentTime + 0.25) {
    while (this.nextTime < horizon) {
      this.play(this.step, this.nextTime);
      this.nextTime += 15 / this.song.bpm;
      this.step++;
    }
  }

  private arrange(full: boolean) {
    const r = this.rnd, s = this.song;
    const keep = (p: number) => full || r() < p;
    const rest = !full && r() < 0.25;
    this.layers = {
      beat: !!s.kit && !rest && keep(0.9),
      bass: !!s.bass && keep(0.85),
      arp: !!s.arp && keep(0.75),
      motif: !!s.motif && keep(0.8),
    };
  }

  private play(step: number, t: number) {
    const r = this.rnd, s = this.song, i = step % 16, bar = Math.floor(step / 16);
    const sixteenth = 15 / s.bpm, barLen = sixteenth * 16;
    const deg = (d: number) => s.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    const chord = s.chords[Math.floor(bar / s.chordBars) % s.chords.length];
    const at = i % 2 ? t + s.swing * sixteenth : t;

    if (i === 0 && bar >= 2 && (bar - 2) % 8 === 0) this.arrange(bar === 2);
    const L = this.layers;

    if (i === 0 && bar % s.chordBars === 0) {
      this.pad(t, s.voicing.map((k) => s.root + deg(chord + k)), barLen * s.chordBars * 1.5);
      if (!s.bass) this.sub(t, s.root - 12 + deg(chord), barLen * s.chordBars);
    }
    if (s.drone && i === 0 && bar % 4 === 0) this.drone(t, s.root - 12, barLen * 5);

    if (L.beat && s.kit) {
      const vel = (p: string) => (p[i] && p[i] !== "." ? Number(p[i]) / 9 : 0);
      const k = vel(s.kit.kick), sn = vel(s.kit.snare), h = vel(s.kit.hat), tk = vel(s.kit.tick);
      if (k) this.kick(at, k);
      if (sn) this.snare(at, sn);
      if (h) this.hat(at, h * (0.8 + r() * 0.4));
      if (tk) this.tick(at, tk);
      if (i === 14 && r() < s.stutter * 2) for (let k = 1; k <= 3; k++) this.hat(t + (k * sixteenth) / 3, 0.5);
    }

    const b = s.bass?.[i];
    if (L.bass && b && "rfo".includes(b)) {
      let len = 1;
      while (s.bass![i + len] === "-") len++;
      this.bass(at, s.root - 12 + deg(chord + (b === "f" ? 4 : 0)) + (b === "o" ? 12 : 0), len * sixteenth * 0.92);
    }

    if (L.arp && s.arp && i % s.arp.rate === 0) {
      const n = Math.floor(step / s.arp.rate);
      const tones = [0, 2, 4, 7].map((k) => s.root + 12 + deg(chord + k));
      const sweep = 1 + 0.5 * Math.sin((step / 256) * Math.PI * 2);
      this.arp(at, tones[s.arp.order[n % s.arp.order.length]], s.arp.cut * sweep, (n % 2 ? 0.35 : -0.35) * s.width);
    }

    if (L.motif && s.motif && i % s.motif.slot === 0) {
      const m = s.motif, n = Math.floor(step / m.slot), d = m.notes[n % m.notes.length];
      if (d !== null) {
        const dd = Math.floor(n / m.notes.length) % 4 === 3 && r() < 0.35 ? d + pick(r, [-1, 1, 2]) : d;
        const note = s.root + LEAD_OCTAVE[m.lead] + deg(dd);
        this.lead(at, note, m.slot * sixteenth * 1.8, 1);
        if (r() < s.stutter) for (let k = 1; k <= 3; k++) this.lead(at + k * sixteenth * 0.5, note, sixteenth, 0.5 / k);
      }
    }

    if (i % 2 === 0 && r() < (i % 4 === 0 ? s.bells : s.bells / 2)) {
      this.bell(t, s.root + 12 + deg(chord + pick(r, [0, 2, 4, 7, 9])), 0.03 + r() * 0.025);
    }

    if (s.bend && i === 12 && bar % 8 === 7) {
      for (const p of this.pads.slice(-2)) for (const { o, base } of p.osc) {
        o.detune.setTargetAtTime(base - 60, t, 0.25);
        o.detune.setTargetAtTime(base, t + 0.9, 0.4);
      }
    }
  }

  private hold(g: GainNode) {
    this.held = [...this.held.slice(-7), g];
  }

  private pad(t: number, notes: number[], dur: number) {
    const ctx = this.ctx!, s = this.song, kind = PADS[s.pad];
    const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: s.padCut, Q: 0.3 });
    const g = new GainNode(ctx, { gain: 0 });
    lp.frequency.setValueAtTime(s.padCut, t);
    lp.frequency.linearRampToValueAtTime(s.padCut * kind.open, t + dur * 0.45);
    lp.frequency.linearRampToValueAtTime(s.padCut, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(kind.level, t + dur * 0.3);
    g.gain.setValueAtTime(kind.level, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g).connect(this.bus);
    g.connect(this.verbSend);
    let vibrato: GainNode | null = null;
    if (kind.vibrato) {
      const lfo = new OscillatorNode(ctx, { frequency: 4.6 + this.rnd() });
      vibrato = new GainNode(ctx, { gain: kind.vibrato });
      lfo.connect(vibrato);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
    }
    const osc: { o: OscillatorNode; base: number }[] = [];
    for (const n of notes) {
      for (const [type, det, oct] of kind.osc) {
        const o = new OscillatorNode(ctx, { type, frequency: hz(n), detune: det + oct });
        vibrato?.connect(o.detune);
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.1);
        osc.push({ o, base: det + oct });
      }
    }
    this.pads = [...this.pads.slice(-3), { osc }];
    this.hold(g);
  }

  private sub(t: number, midi: number, dur: number) {
    const ctx = this.ctx!;
    const o = new OscillatorNode(ctx, { type: "sine", frequency: hz(midi) });
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 1.2);
    g.gain.setValueAtTime(0.07, t + dur - 1.5);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.1);
    this.hold(g);
  }

  private drone(t: number, midi: number, dur: number) {
    const ctx = this.ctx!;
    const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 280, Q: 0.6 });
    const g = new GainNode(ctx, { gain: 0 });
    lp.frequency.setValueAtTime(280, t);
    lp.frequency.linearRampToValueAtTime(760, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(280, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + dur * 0.35);
    g.gain.setValueAtTime(0.035, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g).connect(this.bus);
    g.connect(this.verbSend);
    for (const [n, det] of [[midi, -6], [midi, 5], [midi + 7, 3]]) {
      const o = new OscillatorNode(ctx, { type: "sawtooth", frequency: hz(n), detune: det });
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    this.hold(g);
  }

  private bass(t: number, midi: number, dur: number) {
    const ctx = this.ctx!;
    const lp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 900, Q: 0.7 });
    const g = new GainNode(ctx, { gain: 0 });
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + 0.25);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.012);
    g.gain.setTargetAtTime(0.09, t + 0.02, 0.15);
    g.gain.setTargetAtTime(0, t + dur, 0.06);
    lp.connect(g).connect(this.bus);
    for (const type of ["triangle", "sine"] as const) {
      const o = new OscillatorNode(ctx, { type, frequency: hz(midi) });
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.4);
    }
  }

  private arp(t: number, midi: number, cut: number, pan: number) {
    const ctx = this.ctx!, s = this.song;
    const o = new OscillatorNode(ctx, { type: s.arp!.wave, frequency: hz(midi), detune: (this.rnd() - 0.5) * 6 });
    const lp = new BiquadFilterNode(ctx, { type: "lowpass", Q: 1.2 });
    const g = new GainNode(ctx, { gain: 0 });
    const tail = s.arp!.rate === 1 ? 0.3 : 0.5;
    lp.frequency.setValueAtTime(cut * 2, t);
    lp.frequency.exponentialRampToValueAtTime(cut * 0.6, t + 0.18);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + tail);
    o.connect(lp).connect(g).connect(new StereoPannerNode(ctx, { pan })).connect(this.bus);
    g.connect(this.delaySend);
    o.start(t);
    o.stop(t + tail + 0.05);
  }

  private lead(t: number, midi: number, dur: number, vel: number) {
    const lead = this.song.motif!.lead;
    if (lead === "bell") return this.bell(t, midi, 0.05 * vel);
    if (lead === "celesta") return this.bell(t, midi, 0.04 * vel, 4, 0.5, 1.6);
    const ctx = this.ctx!, f = hz(midi);
    const g = new GainNode(ctx, { gain: 0 });
    const p = new StereoPannerNode(ctx, { pan: (this.rnd() - 0.5) * 0.5 * this.song.width });
    g.connect(p).connect(this.bus);
    g.connect(this.verbSend);
    g.connect(this.delaySend);
    if (lead === "flute") {
      const vib = new GainNode(ctx, { gain: 0 });
      const lfo = new OscillatorNode(ctx, { frequency: 5 });
      vib.gain.setValueAtTime(0, t);
      vib.gain.linearRampToValueAtTime(9, t + 0.5);
      lfo.connect(vib);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06 * vel, t + 0.07);
      g.gain.setTargetAtTime(0, t + dur, 0.12);
      for (const [type, det] of [["sine", 0], ["triangle", 4]] as const) {
        const o = new OscillatorNode(ctx, { type, frequency: f, detune: det });
        vib.connect(o.detune);
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 0.8);
      }
      lfo.start(t);
      lfo.stop(t + dur + 0.8);
    } else {
      const lp = new BiquadFilterNode(ctx, { type: "lowpass", Q: 0.8 });
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + 0.35);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06 * vel, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      lp.connect(g);
      for (const [type, det] of [["triangle", 0], ["sawtooth", 5]] as const) {
        const o = new OscillatorNode(ctx, { type, frequency: f, detune: det });
        o.connect(lp);
        o.start(t);
        o.stop(t + 0.95);
      }
    }
  }

  private bell(t: number, midi: number, vel: number, ratio = 2, index = 0.9, decay = 3) {
    const ctx = this.ctx!;
    const f = hz(midi);
    const car = new OscillatorNode(ctx, { type: "sine", frequency: f });
    const mod = new OscillatorNode(ctx, { type: "sine", frequency: f * ratio });
    const depth = new GainNode(ctx, { gain: 0 });
    const g = new GainNode(ctx, { gain: 0 });
    depth.gain.setValueAtTime(f * index, t);
    depth.gain.exponentialRampToValueAtTime(f * 0.02, t + decay * 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    mod.connect(depth).connect(car.frequency);
    const p = new StereoPannerNode(ctx, { pan: (this.rnd() - 0.5) * 0.8 * (this.song?.width ?? 1) });
    car.connect(g).connect(p).connect(this.bus);
    g.connect(this.verbSend);
    g.connect(this.delaySend);
    car.start(t);
    mod.start(t);
    car.stop(t + decay + 0.1);
    mod.stop(t + decay + 0.1);
  }

  private kick(t: number, v: number) {
    const ctx = this.ctx!;
    const o = new OscillatorNode(ctx, { type: "sine", frequency: 130 });
    const g = new GainNode(ctx, { gain: 0 });
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.5);
  }

  private snare(t: number, v: number) {
    const ctx = this.ctx!;
    const n = new AudioBufferSourceNode(ctx, { buffer: this.noise });
    const bp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 1600, Q: 0.7 });
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    n.connect(bp).connect(g).connect(this.drums);
    g.connect(this.verbSend);
    n.start(t, this.rnd() * 0.7);
    n.stop(t + 0.25);
    const o = new OscillatorNode(ctx, { type: "triangle", frequency: 185 });
    const og = new GainNode(ctx, { gain: 0 });
    o.frequency.setValueAtTime(185, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.1);
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.08 * v, t + 0.003);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(og).connect(this.drums);
    o.start(t);
    o.stop(t + 0.15);
  }

  private hat(t: number, v: number) {
    const ctx = this.ctx!;
    const n = new AudioBufferSourceNode(ctx, { buffer: this.noise });
    const hp = new BiquadFilterNode(ctx, { type: "highpass", frequency: 6000 });
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035 * v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    n.connect(hp).connect(g).connect(new StereoPannerNode(ctx, { pan: 0.25 * this.song.width })).connect(this.drums);
    n.start(t, this.rnd() * 0.9);
    n.stop(t + 0.06);
  }

  private tick(t: number, v: number) {
    const ctx = this.ctx!;
    const o = new OscillatorNode(ctx, { type: "triangle", frequency: 1800 + this.rnd() * 600 });
    const g = new GainNode(ctx, { gain: 0 });
    const p = new StereoPannerNode(ctx, { pan: (this.rnd() - 0.5) * 1.2 * this.song.width });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03 * v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(p).connect(this.drums);
    g.connect(this.delaySend);
    o.start(t);
    o.stop(t + 0.06);
  }
}

export const engine = new Engine();
