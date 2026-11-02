import { useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import type { Slot } from "@gl36/sdk";
import type { Lang } from "../i18n/strings";
import { $chain, $chainError, $selected, $wallet } from "../lib/store";
import { pad, priceSol } from "../lib/format";
import { openConnect } from "./WalletButton";
import PieceModal from "./PieceModal";
import { PieceArt, useT } from "./ui";

type Tab = "sale" | "all" | "yours";
type Sort = "priceUp" | "priceDown" | "idUp" | "idDown";
const PAGE = 48;

const ORDER: Record<Sort, (a: Slot, b: Slot) => number> = {
  priceUp: (a, b) => (a.price || Infinity) - (b.price || Infinity) || a.id - b.id,
  priceDown: (a, b) => b.price - a.price || a.id - b.id,
  idUp: (a, b) => a.id - b.id,
  idDown: (a, b) => b.id - a.id,
};

export default function Gallery({ lang }: { lang: Lang }) {
  const tr = useT(lang);
  const chain = useStore($chain);
  const error = useStore($chainError);
  const wallet = useStore($wallet);
  const selected = useStore($selected);
  const [tab, setTab] = useState<Tab>("sale");
  const [sort, setSort] = useState<Sort>("priceUp");
  const [limit, setLimit] = useState(PAGE);

  const slots = chain?.col.slots ?? [];
  const listed = slots.filter((s) => s.price > 0);
  const owners = new Set(slots.map((s) => s.owner)).size;
  const floor = listed.length ? Math.min(...listed.map((s) => s.price)) : 0;

  const shown = useMemo(() => {
    const list = tab === "sale" ? listed : tab === "yours" ? slots.filter((s) => s.owner === wallet?.address) : slots;
    return [...list].sort(ORDER[sort]);
  }, [chain, tab, sort, wallet]);

  return (
    <div>
      <div className="col-head">
        <div>
          <h2 className="headline qr">{tr("col.title")}</h2>
          <p className="subhead">
            {!chain ? " " : floor ? tr("col.summary", { floor: `${priceSol(floor)} SOL`, listed: listed.length, owners }) : tr("col.summaryNoFloor", { owners })}
          </p>
        </div>
        <div className="controls">
          <div className="tabs" role="group" aria-label={tr("col.title")}>
            {(["sale", "all", "yours"] as Tab[]).map((k) => (
              <button key={k} aria-pressed={tab === k} onClick={() => { setTab(k); setLimit(PAGE); }}>
                {k === "sale" ? tr("col.forSale") : k === "all" ? tr("col.all") : tr("col.yours")}
              </button>
            ))}
          </div>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={tr("col.sort")}>
            <option value="priceUp">{tr("col.sort.priceUp")}</option>
            <option value="priceDown">{tr("col.sort.priceDown")}</option>
            <option value="idUp">{tr("col.sort.idUp")}</option>
            <option value="idDown">{tr("col.sort.idDown")}</option>
          </select>
        </div>
      </div>

      {!chain && <p className={error ? "empty error" : "empty"}>{error ? tr("col.error", { msg: error }) : tr("col.loading")}</p>}
      {chain && !shown.length && (
        <div className="empty">
          <p>{tab === "sale" ? tr("col.emptyForSale") : wallet ? tr("col.emptyYours") : tr("col.connectYours")}</p>
          {tab === "yours" && !wallet && <button className="btn primary" onClick={openConnect}>{tr("wallet.connect")}</button>}
        </div>
      )}

      <div className="grid">
        {shown.slice(0, limit).map((s) => {
          const label = tr("piece.title", { id: pad(s.id) });
          const mine = s.owner === wallet?.address;
          return (
            <button key={`${chain!.cfgId}:${s.id}`} className="tile" onClick={() => $selected.set(s.id)} aria-label={label}>
              <div className="art-wrap"><PieceArt id={s.id} label={label} /></div>
              <div className="meta">
                <span>{label}</span>
                <span>{s.price > 0 ? `${priceSol(s.price)} SOL` : mine ? tr("col.yours") : chain!.revealed ? "" : tr("col.hidden")}</span>
              </div>
            </button>
          );
        })}
      </div>
      {shown.length > limit && (
        <p className="more"><button className="btn" onClick={() => setLimit(limit + PAGE)}>{tr("col.more")}</button></p>
      )}

      {selected !== null && chain && selected < chain.col.minted && <PieceModal lang={lang} id={selected} onClose={() => $selected.set(null)} />}
    </div>
  );
}
