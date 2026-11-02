import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { address as toAddress, isAddress } from "@solana/kit";
import { buyIx, listIx, transferIx } from "@gl-36/sdk";
import type { Key, Lang } from "../i18n/strings";
import { CONFIG, explorerAddress } from "../lib/config";
import { $chain, $sound, $voice, $wallet, collectionCfg } from "../lib/store";
import { asAddress, rarityTable, seedFor, type Rarity } from "../lib/chain";
import { renderStages } from "../lib/art";
import { attempt } from "../lib/tx";
import { pad, parsePrice, priceSol, short } from "../lib/format";
import { engine } from "../audio/engine";
import { openConnect } from "./WalletButton";
import { PieceArt, StaticNoise, useT } from "./ui";

const TRAIT_KEYS = ["composition", "palette", "compression", "overlay", "layer", "glitch", "chroma", "mosh", "generations", "quality"] as const;

export default function PieceModal({ lang, id, onClose }: { lang: Lang; id: number; onClose: () => void }) {
  const tr = useT(lang);
  const chain = useStore($chain)!;
  const wallet = useStore($wallet);
  const sound = useStore($sound);
  const voice = useStore($voice);
  const slot = chain.col.slots[id];
  const mine = !!wallet && slot.owner === wallet.address;
  const [info, setInfo] = useState<{ traits: Record<string, string | number>; hash: string } | null>(null);
  const [rarity, setRarity] = useState<Rarity | null>(null);
  const [form, setForm] = useState<null | "list" | "transfer">(null);
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const replayCanvas = useRef<HTMLCanvasElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const label = tr("piece.title", { id: pad(id) });
  const voiceKey = `${chain.cfgId}:${id}`;
  const listening = sound && voice === voiceKey;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close.current();
      if (e.key !== "Tab" || !sheet.current) return;
      const items = [...sheet.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input, select, [tabindex]:not([tabindex='-1'])")];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      opener?.focus();
    };
  }, []);

  useEffect(() => { rarityTable().then(setRarity); }, [chain.col.minted]);
  useEffect(() => { setForm(null); setErr(null); }, [id, slot.owner, slot.price]);

  const collection = asAddress(collectionCfg()!.address);
  const programId = asAddress(CONFIG.programId);

  const replay = async () => {
    const seed = await seedFor(id);
    if (!seed) return;
    setReplaying(true);
    const { frames } = await renderStages(seed, 64, true);
    const ctx = replayCanvas.current?.getContext("2d");
    for (let k = 0; k < frames.length && ctx; k++) {
      ctx.drawImage(frames[k].bitmap, 0, 0);
      await new Promise((r) => setTimeout(r, k === 0 ? 900 : Math.max(60, 1800 / frames.length)));
    }
    await new Promise((r) => setTimeout(r, 700));
    setReplaying(false);
  };

  const listen = async () => {
    if (listening) {
      engine.retune(null);
      $voice.set(null);
      return;
    }
    const seed = await seedFor(id);
    if (!seed) return;
    engine.retune(seed, info?.traits);
    $voice.set(voiceKey);
    if (!engine.running) await engine.start();
    $sound.set(true);
  };

  const act = async (action: Key, build: Parameters<typeof attempt>[2]) => {
    setBusy(true);
    const sig = await attempt(lang, action, build);
    setBusy(false);
    if (sig) setForm(null);
  };

  const submit = () => {
    setErr(null);
    if (form === "list") {
      const units = parsePrice(value);
      if (units === null) return setErr(tr("piece.badPrice"));
      act("toast.list", (me) => [listIx(programId, me, collection, id, units)]);
    } else if (form === "transfer") {
      const to = value.trim();
      if (!isAddress(to)) return setErr(tr("piece.badAddress"));
      act("toast.transfer", (me) => [transferIx(programId, me, collection, toAddress(to), id)]);
    }
  };

  const rarityOf = (k: string, v: string | number) => {
    if (!rarity || k === "generations" || k === "quality") return null;
    const n = rarity.counts.get(`${k}=${v}`) ?? 0;
    return tr("piece.rarity", { pct: ((n * 100) / rarity.total).toFixed(n * 100 < rarity.total ? 1 : 0) });
  };

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label={label} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheet}>
        <button ref={closeBtn} className="sheet-close" onClick={onClose} aria-label={tr("piece.close")}>✕</button>
        <div className="sheet-art">
          {chain.revealed ? (
            <>
              <div style={{ display: replaying ? "none" : "block" }}>
                <PieceArt id={id} label={label} priority onReady={setInfo} />
              </div>
              <canvas ref={replayCanvas} className="art" width={256} height={256} style={{ display: replaying ? "block" : "none" }} aria-hidden="true" />
            </>
          ) : (
            <StaticNoise label={label} seed={id + 1} />
          )}
        </div>

        <div className="sheet-side">
          <div>
            <h2>{label}</h2>
          </div>

          <dl className="rows">
            <div>
              <dt>{tr("piece.owner")}</dt>
              <dd>{mine ? tr("piece.you") : <a href={explorerAddress(slot.owner)} target="_blank" rel="noreferrer" className="mono">{short(slot.owner, 5)}</a>}</dd>
            </div>
            <div>
              <dt>{tr("piece.price")}</dt>
              <dd>{slot.price > 0 ? `${priceSol(slot.price)} SOL` : <span className="secondary">{tr("piece.notForSale")}</span>}</dd>
            </div>
          </dl>

          <div className="stack">
            {!wallet && (
              <>
                <button className="btn primary block" onClick={openConnect}>{tr("wallet.connect")}</button>
                <p className="fine" style={{ margin: 0 }}>{tr("piece.connectToAct")}</p>
              </>
            )}
            {wallet && !mine && slot.price > 0 && (
              <button className="btn primary block" disabled={busy} onClick={() =>
                act("toast.buy", (me) => [buyIx(programId, me, collection, slot.owner, chain.col.treasury, id, slot.price)])}>
                {tr("piece.buy", { price: priceSol(slot.price) })}
              </button>
            )}
            {mine && !form && (
              <div className="inline">
                <button className="btn primary" onClick={() => { setForm("list"); setValue(slot.price ? priceSol(slot.price) : ""); }}>
                  {slot.price > 0 ? tr("piece.changePrice") : tr("piece.list")}
                </button>
                {slot.price > 0 && (
                  <button className="btn" disabled={busy} onClick={() => act("toast.delist", (me) => [listIx(programId, me, collection, id, 0)])}>
                    {tr("piece.delist")}
                  </button>
                )}
                <button className="btn" onClick={() => { setForm("transfer"); setValue(""); }}>{tr("piece.transfer")}</button>
              </div>
            )}
            {form && (
              <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <div className="field">
                  <label htmlFor="piece-input">{form === "list" ? tr("piece.priceLabel") : tr("piece.recipient")}</label>
                  <input id="piece-input" name={form === "list" ? "price" : "recipient"} autoComplete="off" className="input" autoFocus value={value} onChange={(e) => setValue(e.target.value)}
                    inputMode={form === "list" ? "decimal" : "text"} placeholder={form === "list" ? "0.05" : ""} spellCheck={false} />
                </div>
                {err && <p className="error">{err}</p>}
                <div className="inline">
                  <button className="btn primary" type="submit" disabled={busy}>{tr("piece.confirm")}</button>
                  <button className="btn" type="button" onClick={() => setForm(null)}>{tr("piece.cancel")}</button>
                </div>
              </form>
            )}
            {(slot.price > 0 || mine) && <p className="fine" style={{ margin: 0 }}>{tr("piece.fee", { fee: chain.col.feeBps / 100 })}</p>}
          </div>

          {chain.revealed ? (
            <div className="inline">
              <button className="btn small" onClick={replay} disabled={replaying}>{tr("piece.replay")}</button>
              <button className={`btn small${listening ? " sound on" : ""}`} aria-pressed={listening} onClick={listen}>
                {listening && <span className="bars" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} />)}</span>}
                {listening ? tr("piece.listening") : tr("piece.listen")}
              </button>
            </div>
          ) : (
            <p className="secondary" style={{ margin: 0 }}>{tr("piece.hidden")}</p>
          )}

          {info && (
            <dl className="rows">
              {TRAIT_KEYS.filter((k) => info.traits[k] !== undefined && !(k === "layer" && info.traits[k] === "—")).map((k) => (
                <div key={k}>
                  <dt>{tr(`trait.${k}` as Key)}</dt>
                  <dd>{String(info.traits[k])}{rarityOf(k, info.traits[k]) && <small>{rarityOf(k, info.traits[k])}</small>}</dd>
                </div>
              ))}
            </dl>
          )}
          {info && <p className="hash">{tr("piece.verify")} {info.hash}</p>}
        </div>
      </div>
    </div>
  );
}
