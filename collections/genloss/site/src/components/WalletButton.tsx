import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import type { Wallet } from "@wallet-standard/base";
import type { Lang } from "../i18n/strings";
import { $balance, $wallet, toast } from "../lib/store";
import { connectStandard, disconnect, onWalletsChanged, solanaWallets } from "../lib/wallet";
import { explain } from "../lib/tx";
import { short, sol } from "../lib/format";
import { useT } from "./ui";

export const openConnect = () => window.dispatchEvent(new Event("genloss:connect"));

export default function WalletButton({ lang }: { lang: Lang }) {
  const tr = useT(lang);
  const wallet = useStore($wallet);
  const balance = useStore($balance);
  const [open, setOpen] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setWallets(solanaWallets());
    update();
    const off = onWalletsChanged(update);
    const openMenu = () => { setOpen(true); box.current?.scrollIntoView({ block: "nearest" }); };
    window.addEventListener("genloss:connect", openMenu);
    return () => { off(); window.removeEventListener("genloss:connect", openMenu); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const choose = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setOpen(false);
    } catch (e) {
      toast("error", explain(e, lang));
    }
  };

  return (
    <div className="menu-wrap" ref={box}>
      <button className={wallet ? "btn small" : "btn primary small"} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="wallet-menu">
        {wallet?.icon && <img src={wallet.icon} alt="" width={18} height={18} />}
        {wallet ? <span className="mono">{short(wallet.address)}</span> : tr("wallet.connect")}
      </button>
      {open && (
        <div className="menu" id="wallet-menu">
          {wallet ? (
            <>
              <p>
                {wallet.name}
                {balance !== null && <><br /><span style={{ color: "var(--ink)", fontSize: 17 }}>{sol(balance, 4)} SOL</span></>}
              </p>
              <button onClick={() => { navigator.clipboard.writeText(wallet.address); toast("ok", tr("wallet.copied")); setOpen(false); }}>{tr("wallet.copy")}</button>
              <hr />
              <button onClick={() => { disconnect(); setOpen(false); }}>{tr("wallet.disconnect")}</button>
            </>
          ) : (
            <>
              <p>{tr("wallet.choose")}</p>
              {wallets.map((w) => (
                <button key={w.name} onClick={() => choose(() => connectStandard(w))}>
                  <img src={w.icon} alt="" width={22} height={22} />
                  {w.name}
                </button>
              ))}
              {!wallets.length && <p>{tr("wallet.none")}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
