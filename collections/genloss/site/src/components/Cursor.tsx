import { useEffect, useRef } from "react";

export default function Cursor() {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const node = el.current!;
    let tx = -100, ty = -100, x = -100, y = -100, raf = 0, big = false;
    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      const t = e.target as Element | null;
      const next = !!t?.closest("a, button, select, input, [role=button], .tile, .live");
      if (next !== big) { big = next; node.classList.toggle("big", big); }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
      const q = (v: number) => Math.round(v / 8) * 8;
      node.style.transform = `translate3d(${q(x)}px, ${q(y)}px, 0)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(tick) : 0;
    };
    const leave = () => node.classList.add("off");
    const enter = () => node.classList.remove("off");
    addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    document.addEventListener("pointerenter", enter);
    node.classList.add("on");
    return () => {
      removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      document.removeEventListener("pointerenter", enter);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={el} className="cursor" aria-hidden="true" />;
}
