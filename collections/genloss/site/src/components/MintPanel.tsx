import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { FLAG_CLOSED, SLOT_LEN, mintIx } from "@gl-36/sdk";
import type { Lang } from "../i18n/strings";
import { COLLECTIONS, CONFIG } from "../lib/config";
import { $chain, $chainError, $collectionId, $wallet } from "../lib/store";
import { asAddress, lamportsPerByte } from "../lib/chain";
import { attempt } from "../lib/tx";
import { pad, sol } from "../lib/format";
import { openConnect } from "./WalletButton";
import { useT } from "./ui";

const n0 = (v: number) => v.toLocaleString("en-US");

export default function MintPanel({ lang }: { lang: Lang }) {
  const tr = useT(lang);
  const chain = useStore($chain);
  const error = useStore($chainError);
  const colId = useStore($collectionId);
  const wallet = useStore($wallet);
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [lpb, setLpb] = useState<bigint | null>(null);

  useEffect(() => { lamportsPerByte().then(setLpb).catch(() => {}); }, []);
  useEffect(() => { setDone(null); setN(1); }, [colId]);

  const col = chain?.col;
  const left = col ? col.maxSupply - col.minted : 0;
  const closed = !!col && (col.flags & FLAG_CLOSED) !== 0;
  const soldOut = !!col && left <= 0;
  const max = Math.max(1, Math.min(10, left));
  const qty = Math.min(n, max);
  const rent = lpb !== null ? lpb * BigInt(SLOT_LEN * qty) : null;
  const total = col ? col.mintPrice * BigInt(qty) + (rent ?? 0n) : 0n;
  const other = COLLECTIONS.find((c) => c.id !== colId);

  if (!COLLECTIONS.length) {
    return (
      <div className="mint">
        <p className="secondary" style={{ margin: 0 }}>{tr("col.soon")}</p>
      </div>
    );
  }

  const mint = async () => {
    if (!col || !chain) return;
    setBusy(true);
    setDone(null);
    const first = col.minted;
    const cfg = COLLECTIONS.find((c) => c.id === chain.cfgId)!;
    const sig = await attempt(lang, "toast.mint", (me) => [mintIx(asAddress(CONFIG.programId), me, asAddress(cfg.address), col.creator, qty)]);
    if (sig) setDone(qty === 1 ? pad(first) : `${pad(first)}–${pad(first + qty - 1)}`);
    setBusy(false);
  };

  return (
    <div className="mint" aria-busy={!chain}>
      <div className="mint-head">
        {COLLECTIONS.length > 1 && (
          <div className="tabs" role="group" aria-label={tr("nav.collection")}>
            {COLLECTIONS.map((c) => (
              <button key={c.id} aria-pressed={c.id === colId} onClick={() => $collectionId.set(c.id)}>{c.title}</button>
            ))}
          </div>
        )}
        {chain && <span className="tertiary" style={{ fontSize: 14 }}>{chain.revealed ? tr("mint.revealed") : tr("mint.unrevealed")}</span>}
      </div>

      {error && !chain && <p className="error" style={{ marginTop: 20 }}>{tr("col.error", { msg: error })}</p>}

      <p className="price">{col ? (col.mintPrice === 0n ? tr("mint.free") : tr("mint.each", { price: `${sol(col.mintPrice)} SOL` })) : " "}</p>
      <p className="secondary" style={{ margin: 0 }}>{col ? tr("mint.progress", { minted: n0(col.minted), max: n0(col.maxSupply) }) : " "}</p>
      <div className="bar" aria-hidden="true">
        <i style={{ width: col ? `${Math.max(0.6, (col.minted / col.maxSupply) * 100)}%` : "0%" }} />
      </div>

      {soldOut || closed ? (
        <>
          <button className="btn block" disabled>{soldOut ? tr("mint.soldOut") : tr("mint.closed")}</button>
          {other && (
            <p className="fine center">
              <button className="link" style={{ fontSize: 15 }} onClick={() => $collectionId.set(other.id)}>{tr("mint.other", { name: other.title })}</button>
            </p>
          )}
        </>
      ) : (
        <>
          <div className="qty-row">
            <div className="field">
              <label id="qty-label">{tr("mint.quantity")}</label>
              <div className="stepper" role="group" aria-labelledby="qty-label">
                <button onClick={() => setN(Math.max(1, qty - 1))} disabled={qty <= 1} aria-label={tr("mint.less")}>−</button>
                <output aria-live="polite">{qty}</output>
                <button onClick={() => setN(Math.min(max, qty + 1))} disabled={qty >= max} aria-label={tr("mint.more")}>+</button>
              </div>
            </div>
            <div className="total">
              <span className="secondary" style={{ fontSize: 14 }}>{tr("mint.total")}</span>
              <strong>{sol(total)} SOL</strong>
            </div>
          </div>
          {wallet ? (
            <button className="btn primary block" onClick={mint} disabled={busy || !col}>{busy ? tr("mint.busy") : tr("mint.cta", { n: qty })}</button>
          ) : (
            <button className="btn primary block" onClick={openConnect}>{tr("mint.connect")}</button>
          )}
          {rent !== null && <p className="fine">{tr("mint.rent", { rent: sol(rent, 6), bytes: SLOT_LEN * qty })}</p>}
        </>
      )}

      {done && <p className="done" role="status">{tr("mint.done", { ids: done })}</p>}
    </div>
  );
}
