import { useEffect, useRef, useState } from "react";
import { LiveLoss } from "../gl/live-loss";
import { renderStages } from "../lib/art";
import { dramaticFeatured } from "../lib/featured";
import { engine } from "../audio/engine";

export default function HeroLive() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallback = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"gl" | "still">("gl");

  useEffect(() => {
    const cv = canvas.current!;
    const loss = LiveLoss.create(cv);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, live = true, visible = true, frames = 0;

    dramaticFeatured()
      .then((f) => renderStages(f.seed, 2, true))
      .then(({ frames: st }) => {
        if (!live) return;
        if (loss) loss.setImage(st[0].bitmap);
        else fallback.current?.getContext("2d")!.drawImage(st[st.length - 1].bitmap, 0, 0);
      })
      .catch(() => {});

    if (!loss) {
      setMode("still");
      return () => { live = false; };
    }

    const fit = () => {
      const r = cv.getBoundingClientRect();
      const scale = r.width > 1100 ? 3 : r.width > 600 ? 2.5 : 2;
      loss.resize(r.width / scale, r.height / scale);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(cv);

    const host = cv.parentElement!;
    let ptr: [number, number] = [0.5, 0.5], last: [number, number] = [0.5, 0.5], lastMove = -1e9;
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      ptr = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
      lastMove = performance.now();
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerdown", onMove);

    let lens = 0, vel: [number, number] = [0, 0], t0 = performance.now(), nextShift = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      frames++;
      if (frames % 2) return;
      const t = (now - t0) / 1000;
      const idle = now - lastMove > 2500;
      let p = ptr;
      if (idle) {
        p = [0.5 + 0.34 * Math.sin(t * 0.23), 0.5 + 0.28 * Math.sin(t * 0.31 + 1.3)];
      }
      const dx = p[0] - last[0], dy = p[1] - last[1];
      vel = [vel[0] * 0.6 + dx * 0.4, vel[1] * 0.6 + dy * 0.4];
      last = p;
      lens += ((idle ? 0.55 : 1) - lens) * 0.08;
      const speed = Math.hypot(vel[0], vel[1]);
      let q = 24 + 34 * (0.5 + 0.5 * Math.sin(t * 0.17));
      q *= 1 - Math.min(0.9, speed * 45);
      if (engine.running) q *= 1 - engine.level() * 0.6;
      if (now > nextShift) {
        loss.shiftGrid();
        nextShift = now + 2600 + Math.random() * 3400;
      }
      loss.frame({ ptr: p, vel, lens, quality: Math.max(2, Math.min(80, q)), time: t }, 0.04);
      if (still && loss.saves > 24) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      live = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerdown", onMove);
      loss.destroy();
    };
  }, []);

  return (
    <>
      <canvas ref={canvas} className="live-canvas" aria-hidden="true" style={{ display: mode === "gl" ? "block" : "none" }} />
      {mode === "still" && <canvas ref={fallback} className="live-canvas" width={256} height={256} aria-hidden="true" />}
    </>
  );
}
