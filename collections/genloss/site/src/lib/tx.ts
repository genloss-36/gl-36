import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Instruction,
  type Signature,
  type TransactionSigner,
} from "@solana/kit";
import { ERR } from "@gl36/sdk";
import { t, type Key, type Lang } from "../i18n/strings";
import { refresh, rpc } from "./chain";
import { explorerTx } from "./config";
import { $wallet, toast } from "./store";
import { submitWire } from "./wallet";

const PROGRAM_ERRORS: Record<number, Key> = {
  [ERR.SoldOut]: "err.soldOut",
  [ERR.BadBatch]: "err.batch",
  [ERR.NotOwner]: "err.notOwner",
  [ERR.NotListed]: "err.notListed",
  [ERR.PriceAboveMax]: "err.priceUp",
  [ERR.SellerMismatch]: "err.sold",
  [ERR.SelfBuy]: "err.selfBuy",
  [ERR.MintClosed]: "err.closed",
  [ERR.SameOwner]: "err.sameOwner",
  [ERR.BadId]: "err.badId",
};

class TxError extends Error {
  constructor(readonly key: Key) {
    super(key);
  }
}

class Explained extends Error {}

export function explain(e: unknown, lang: Lang): string {
  if (e instanceof TxError) return t(lang, e.key);
  if (e instanceof Explained) return e.message;
  const raw = (() => {
    try {
      return `${e instanceof Error ? e.message : ""} ${JSON.stringify(e, (_, v) => (typeof v === "bigint" ? String(v) : v))}`;
    } catch {
      return String(e);
    }
  })();
  const code = /custom program error: 0x([0-9a-f]+)/i.exec(raw);
  if (code) {
    const n = parseInt(code[1], 16);
    return PROGRAM_ERRORS[n] ? t(lang, PROGRAM_ERRORS[n]) : t(lang, "err.program", { code: n });
  }
  if (/rejected|denied|cancel/i.test(raw)) return t(lang, "err.cancelled");
  if (/insufficient (lamports|funds)|no record of a prior credit|InsufficientFundsForRent/i.test(raw)) return t(lang, "err.funds");
  if (/429|Too Many Requests/i.test(raw)) return t(lang, "err.rate");
  return t(lang, "err.generic");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function run(lang: Lang, action: Key, build: (me: TransactionSigner) => Instruction[]): Promise<string> {
  const w = $wallet.get();
  if (!w) throw new TxError("err.connect");
  const me = createNoopSigner(address(w.address));
  const { value: blockhash } = await rpc().getLatestBlockhash({ commitment: "confirmed" }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(me, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(build(me), m),
  );
  const tx = compileTransaction(message);
  const submitted = await submitWire(new Uint8Array(getTransactionEncoder().encode(tx)));
  const name = t(lang, action);
  let sig: Signature;
  if ("sent" in submitted) {
    sig = submitted.sent;
    toast("info", t(lang, "toast.sent", { action: name }), explorerTx(sig));
  } else {
    const signed = getTransactionDecoder().decode(submitted.signed);
    sig = getSignatureFromTransaction(signed);
    toast("info", t(lang, "toast.sent", { action: name }), explorerTx(sig));
    await rpc().sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: "base64", preflightCommitment: "confirmed" }).send();
  }
  for (let i = 0; i < 60; i++) {
    await sleep(1_000);
    const { value } = await rpc().getSignatureStatuses([sig]).send();
    const st = value[0];
    if (st?.err) {
      const t2 = await rpc().getTransaction(sig, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }).send();
      throw new Explained(explain({ logs: t2?.meta?.logMessages, err: st.err }, lang));
    }
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      toast("ok", t(lang, "toast.done", { action: name }), explorerTx(sig));
      await refresh();
      return sig;
    }
  }
  throw new TxError("err.timeout");
}

export async function attempt(lang: Lang, action: Key, build: (me: TransactionSigner) => Instruction[]) {
  try {
    return await run(lang, action, build);
  } catch (e) {
    toast("error", explain(e, lang));
    return null;
  }
}
