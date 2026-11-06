import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import type { Lang } from "../i18n/strings";
import { CONFIG, DOCS_URL, X, explorerAddress, rpcUrl, setRpcUrl } from "../lib/config";
import { generatorHash, loadGen } from "../lib/generator";
import { $chain, collectionCfg } from "../lib/store";
import { short } from "../lib/format";
import { useT } from "./ui";

const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

export default function FooterLive({ lang }: { lang: Lang }) {
  const tr = useT(lang);
  const chain = useStore($chain);
  const [served, setServed] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [rpc, setRpc] = useState(rpcUrl());

  useEffect(() => {
    generatorHash().then(setServed).catch(() => setServed(""));
    loadGen().then((g) => setVersion(g.VERSION.replace(/^.*\//, "v"))).catch(() => {});
  }, []);

  const onChain = chain ? toHex(chain.col.generatorHash) : null;
  const match = served && onChain ? served === onChain : null;
  const col = collectionCfg();

  return (
    <>
      <div className="foot-row">
        <span>
          {tr("foot.generator", { version })} <span className="mono" title={served ?? ""}>{served ? short(served, 6) : ""}</span>{" "}
          <span style={{ color: match === false ? "var(--danger)" : "var(--ink-2)" }}>
            {match === null ? (col ? tr("foot.checking") : "") : match ? `✓ ${tr("foot.verified")}` : tr("foot.mismatch")}
          </span>
        </span>
        <span>{tr("foot.program")} <a className="mono" href={explorerAddress(CONFIG.programId)} target="_blank" rel="noreferrer">{short(CONFIG.programId, 6)}</a></span>
        {col && <span>{tr("foot.collection")} <a className="mono" href={explorerAddress(col.address)} target="_blank" rel="noreferrer">{short(col.address, 6)}</a></span>}
        <span><a href={DOCS_URL}>{tr("foot.docs")}</a></span>
        <span><a href={X.url} target="_blank" rel="noreferrer">X <span translate="no">@{X.handle}</span></a></span>
      </div>
      <details>
        <summary>{tr("foot.network")}</summary>
        <form className="field" onSubmit={(e) => { e.preventDefault(); setRpcUrl(rpc.trim()); location.reload(); }}>
          <label htmlFor="rpc">{tr("foot.rpc")}</label>
          <input id="rpc" name="rpc" type="url" inputMode="url" autoComplete="off" className="input" value={rpc} onChange={(e) => setRpc(e.target.value)} spellCheck={false} />
          <div className="inline">
            <button className="btn small" type="submit">{tr("foot.save")}</button>
            <button className="btn small" type="button" onClick={() => { setRpcUrl(""); location.reload(); }}>{tr("foot.reset")}</button>
          </div>
        </form>
      </details>
    </>
  );
}
