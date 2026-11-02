import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import type { Lang } from "../i18n/strings";
import { renderStages, type Stage } from "../lib/art";
import { dramaticFeatured } from "../lib/featured";
import { $chain, $selected } from "../lib/store";
import { useT } from "./ui";

export default function DecayStory({ lang }: { lang: Lang }) {
  const tr = useT(lang);
  const chain = useStore($chain);
  const section = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState<Stage[]>([]);
  const [pieceId, setPieceId] = useState<number | null>(null);
  const [i, setI] = useState(0);
  const loaded = useRef(false);
  const key = chain ? `${chain.cfgId}:${chain.revealed}` : "";

  useEffect(() => {
    const go = () => {
      if (loaded.current) return;
      loaded.current = true;
      dramaticFeatured()
        .then((f) => { setPieceId(f.id); return renderStages(f.seed, 64); })
        .then((r) => setFrames(r.frames))
        .catch(() => { loaded.current = false; });
    };
    if (key) go();
    const id = setTimeout(go, 3000);
    return () => clearTimeout(id);
  }, [key]);

  useEffect(() => {
    if (!frames.length) return;
    const ctx = base.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      const el = section.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = r.height - innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      const pos = p * (frames.length - 1);
      const a = Math.floor(pos), b = Math.min(frames.length - 1, a + 1), mix = pos - a;
      ctx.globalAlpha = 1;
      ctx.drawImage(frames[a].bitmap, 0, 0);
      if (mix > 0.01 && b !== a) {
        ctx.globalAlpha = mix;
        ctx.drawImage(frames[b].bitmap, 0, 0);
      }
      setI(Math.round(pos));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    draw();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, [frames]);

  const total = frames.length ? frames[frames.length - 1].generation : 0;
  const gen = frames[i]?.generation ?? 0;
  const caption = !frames.length ? " " : gen === 0 ? tr("hero.gen0") : i === frames.length - 1 ? tr("hero.genEnd", { n: gen }) : tr("hero.genN", { n: gen, total });

  return (
    <div className="story" ref={section}>
      <div className="story-stage">
        <button className="story-art" onClick={() => pieceId !== null && $selected.set(pieceId)} aria-label={caption} tabIndex={pieceId !== null ? 0 : -1}>
          <canvas ref={base} width={256} height={256} />
        </button>
        <div className="story-text">
          <h2 className="headline qr">{tr("story.title")}</h2>
          <p className="story-num" aria-hidden="true">{String(gen).padStart(2, "0")}</p>
          <p className="story-cap" aria-live="polite">{caption}</p>
          <p className="fine">{tr("story.lead")}</p>
        </div>
      </div>
    </div>
  );
}
