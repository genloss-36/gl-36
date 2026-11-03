import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import {
  SolanaSignAndSendTransaction,
  SolanaSignTransaction,
  type SolanaSignAndSendTransactionFeature,
  type SolanaSignTransactionFeature,
} from "@solana/wallet-standard-features";
import { getBase58Decoder, signature, type Signature } from "@solana/kit";
import { CHAIN } from "./config";
import { $wallet } from "./store";

type ConnectFeature = { "standard:connect": { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }> } };
type DisconnectFeature = { "standard:disconnect": { disconnect(): Promise<void> } };
type EventsFeature = { "standard:events": { on(event: "change", cb: (p: { accounts?: readonly WalletAccount[] }) => void): () => void } };

const LAST_KEY = "genloss.wallet";

export const MWA_NAME = "Mobile Wallet Adapter";

export const WALLET_APPS = [
  { name: "Phantom", browse: "https://phantom.com/ul/browse/", install: "https://phantom.com/download" },
  { name: "Solflare", browse: "https://solflare.com/ul/v1/browse/", install: "https://solflare.com/download/" },
  { name: "Backpack", browse: "https://backpack.app/ul/v1/browse/", install: "https://backpack.app/download" },
] as const;

export type WalletApp = (typeof WALLET_APPS)[number];

export const isMobile = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export const browseIn = (app: WalletApp) =>
  `${app.browse}${encodeURIComponent(location.href)}?ref=${encodeURIComponent(location.origin)}`;

let mwa = false;

export async function registerMobile() {
  if (mwa || !/android/i.test(navigator.userAgent)) return;
  mwa = true;
  const { registerMwa } = await import("@solana-mobile/wallet-standard-mobile");
  registerMwa({
    appIdentity: { name: "GENLOSS", uri: `${location.origin}/`, icon: "apple-touch-icon.png" },
    chains: [CHAIN],
    onWalletNotFound: async () => {},
  });
}

export function solanaWallets(): Wallet[] {
  return getWallets()
    .get()
    .filter(
      (w) =>
        "standard:connect" in w.features &&
        (SolanaSignAndSendTransaction in w.features || SolanaSignTransaction in w.features) &&
        w.chains.some((c) => c.startsWith("solana:")),
    );
}

export function onWalletsChanged(cb: () => void) {
  const api = getWallets();
  const a = api.on("register", cb);
  const b = api.on("unregister", cb);
  return () => { a(); b(); };
}

let active: { wallet: Wallet; account: WalletAccount; off?: () => void } | null = null;

export async function connectStandard(wallet: Wallet, silent = false) {
  const { accounts } = await (wallet.features as unknown as ConnectFeature)["standard:connect"].connect(silent ? { silent } : undefined);
  const account = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
  if (!account) throw new Error("The wallet returned no accounts");
  active?.off?.();
  const off = (wallet.features as unknown as Partial<EventsFeature>)["standard:events"]?.on("change", ({ accounts }) => {
    if (!accounts) return;
    const next = accounts[0];
    if (!next) return disconnect();
    active = { wallet, account: next, off };
    $wallet.set({ name: wallet.name, icon: wallet.icon, address: next.address });
  });
  active = { wallet, account, off };
  $wallet.set({ name: wallet.name, icon: wallet.icon, address: account.address });
  try { localStorage.setItem(LAST_KEY, wallet.name); } catch {}
}

export async function disconnect() {
  const w = active?.wallet;
  active?.off?.();
  active = null;
  $wallet.set(null);
  try { localStorage.removeItem(LAST_KEY); } catch {}
  await (w?.features as unknown as Partial<DisconnectFeature> | undefined)?.["standard:disconnect"]?.disconnect().catch(() => {});
}

export async function restore() {
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_KEY); } catch {}
  if (!last) return;
  const w = solanaWallets().find((x) => x.name === last);
  if (w) await connectStandard(w, true).catch(() => {});
}

export type Submitted = { sent: Signature } | { signed: Uint8Array };

export async function submitWire(wire: Uint8Array): Promise<Submitted> {
  if (!active) throw new Error("Connect a wallet first");
  const { wallet, account } = active;
  const features = wallet.features as unknown as Partial<SolanaSignAndSendTransactionFeature & SolanaSignTransactionFeature>;
  const send = features[SolanaSignAndSendTransaction];
  if (send && account.features.includes(SolanaSignAndSendTransaction)) {
    const [out] = await send.signAndSendTransaction({ account, transaction: wire, chain: CHAIN, options: { preflightCommitment: "confirmed" } });
    return { sent: signature(getBase58Decoder().decode(out.signature)) };
  }
  const sign = features[SolanaSignTransaction];
  if (!sign) throw new Error("This wallet can't sign Solana transactions");
  const [out] = await sign.signTransaction({ account, transaction: wire, chain: CHAIN });
  return { signed: out.signedTransaction };
}

