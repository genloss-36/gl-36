import { useStore } from "@nanostores/react";
import type { Lang } from "../i18n/strings";
import { $sound } from "../lib/store";
import { engine } from "../audio/engine";
import { useT } from "./ui";

export async function setSound(on: boolean) {
  if (on) await engine.start();
  else engine.stop();
  $sound.set(on);
}

export default function SoundToggle({ lang }: { lang: Lang }) {
  const tr = useT(lang);
  const on = useStore($sound);
  const label = on ? tr("sound.on") : tr("sound.off");
  return (
    <button className={`btn small sound${on ? " on" : ""}`} aria-pressed={on} aria-label={label} title={label} onClick={() => setSound(!on)}>
      <span className="bars" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <i key={i} />)}
      </span>
      <span className="sound-label">{label}</span>
    </button>
  );
}
