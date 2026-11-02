import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { t, type Key, type Lang } from "../i18n/strings";
import { renderPiece } from "../lib/art";
import { seedFor } from "../lib/chain";
import { $chain } from "../lib/store";

export function useT(lang: Lang) {
  return (key: Key, vars?: Record<string, string | number>) => t(lang, key, vars);
}

export function useInView<T extends Element>(margin = "300px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}

const PROGRESSIVE = [8, 16, 32, 64, 128];

export function ArtCanvas({ bitmap, label }: { bitmap: ImageBitmap | null; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !bitmap) return;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return void ctx.drawImage(bitmap, 0, 0);
    const small = document.createElement("canvas");
    const sctx = small.getContext("2d")!;
    let k = 0, timer = 0;
    const step = () => {
      if (k >= PROGRESSIVE.length) return void ctx.drawImage(bitmap, 0, 0);
      const s = PROGRESSIVE[k++];
      small.width = small.height = s;
      sctx.drawImage(bitmap, 0, 0, s, s);
      ctx.drawImage(small, 0, 0, s, s, 0, 0, 256, 256);
      timer = window.setTimeout(step, 70);
    };
    step();
    return () => clearTimeout(timer);
  }, [bitmap]);
  return <canvas ref={ref} className="art" width={256} height={256} role="img" aria-label={label} />;
}

export function StaticNoise({ label, seed = 0 }: { label: string; seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(32, 32);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = 0, visible = false, s = (seed * 2654435761) >>> 0 || 1;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || now - last < 120) return;
      last = now;
      for (let i = 0; i < img.data.length; i += 4) {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        const v = (s >>> 24) & 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      if (still) cancelAnimationFrame(raf);
    };
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(c);
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [seed]);
  return <canvas ref={ref} className="art static-noise" width={32} height={32} role="img" aria-label={label} />;
}

export function PieceArt({ id, label, priority = false, onReady }: {
  id: number;
  label: string;
  priority?: boolean;
  onReady?: (r: { traits: Record<string, string | number>; hash: string }) => void;
}) {
  const chain = useStore($chain);
  const [ref, seen] = useInView<HTMLDivElement>();
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const revealed = chain?.revealed ?? false;
  const key = chain ? `${chain.cfgId}:${id}` : "";
  useEffect(() => {
    if (!revealed || !(seen || priority) || !key) return;
    let live = true;
    seedFor(id).then((seed) => seed && renderPiece(key, seed, priority)).then((r) => {
      if (!live || !r) return;
      setBitmap(r.bitmap);
      onReady?.(r);
    });
    return () => { live = false; };
  }, [revealed, seen, priority, key, id]);
  return (
    <div ref={ref}>
      {revealed ? <ArtCanvas bitmap={bitmap} label={label} /> : <StaticNoise label={label} seed={id + 1} />}
    </div>
  );
}
