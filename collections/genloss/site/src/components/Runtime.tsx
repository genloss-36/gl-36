import { useEffect } from "react";
import { useStore } from "@nanostores/react";
import type { Lang } from "../i18n/strings";
import { startPolling } from "../lib/chain";
import { onWalletsChanged, registerMobile, restore } from "../lib/wallet";
import { $sound, $toasts } from "../lib/store";
import { engine } from "../audio/engine";
import { useT } from "./ui";

const GESTURES = ["pointerdown", "keydown", "touchend"] as const;

export default function Runtime({ lang }: { lang: Lang }) {
  const tr = useT(lang);
  const toasts = useStore($toasts);

  useEffect(() => {
    startPolling();
    restore();
    const off = onWalletsChanged(() => restore());
    registerMobile().catch(() => {});
    return off;
  }, []);

  useEffect(() => {
    const play = () => { if ($sound.get() && !engine.running) engine.start().catch(() => {}); };
    if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) play();
    const once = () => {
      play();
      GESTURES.forEach((e) => removeEventListener(e, once, true));
    };
    GESTURES.forEach((e) => addEventListener(e, once, true));
    return () => GESTURES.forEach((e) => removeEventListener(e, once, true));
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -12% 0px" });
    const scan = () => document.querySelectorAll(".qr:not(.in)").forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);

  useEffect(() => {
    const nav = document.querySelector(".nav");
    const onScroll = () => nav?.classList.toggle("solid", scrollY > innerHeight * 0.85);
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast ${x.kind}`}>
          <span>{x.text}</span>
          {x.link && <a href={x.link} target="_blank" rel="noreferrer">{tr("toast.view")}</a>}
        </div>
      ))}
    </div>
  );
}
