import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { SolanaSignTransaction, type SolanaSignTransactionFeature } from "@solana/wallet-standard-features";
import { createKeyPairFromPrivateKeyBytes, getAddressFromPublicKey } from "@solana/kit";
import { CHAIN, TESTNET } from "./config";
import { $wallet } from "./store";

type ConnectFeature = { "standard:connect": { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }> } };
type DisconnectFeature = { "standard:disconnect": { disconnect(): Promise<void> } };
type EventsFeature = { "standard:events": { on(event: "change", cb: (p: { accounts?: readonly WalletAccount[] }) => void): () => void } };

const LAST_KEY = "genloss.wallet";
const BURNER_KEY = "genloss.burner";

export function solanaWallets(): Wallet[] {
  return getWallets()
    .get()
    .filter((w) => "standard:connect" in w.features && SolanaSignTransaction in w.features && w.chains.some((c) => c.startsWith("solana:")));
}

export function onWalletsChanged(cb: () => void) {
  const api = getWallets();
  const a = api.on("register", cb);
  const b = api.on("unregister", cb);
  return () => { a(); b(); };
}

let active: { wallet: Wallet; account: WalletAccount; off?: () => void } | null = null;
let burner: { keys: CryptoKeyPair; address: string } | null = null;

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
    $wallet.set({ kind: "standard", name: wallet.name, icon: wallet.icon, address: next.address });
  });
  active = { wallet, account, off };
  burner = null;
  $wallet.set({ kind: "standard", name: wallet.name, icon: wallet.icon, address: account.address });
  try { localStorage.setItem(LAST_KEY, wallet.name); } catch {}
}

function burnerBytes(): Uint8Array {
  let hex = "";
  try { hex = localStorage.getItem(BURNER_KEY) ?? ""; } catch {}
  if (hex.length !== 64) {
    const b = crypto.getRandomValues(new Uint8Array(32));
    hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    try { localStorage.setItem(BURNER_KEY, hex); } catch {}
  }
  return Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
}

export async function connectBurner() {
  const keys = await createKeyPairFromPrivateKeyBytes(burnerBytes());
  const addr = await getAddressFromPublicKey(keys.publicKey);
  active?.off?.();
  active = null;
  burner = { keys, address: addr };
  $wallet.set({ kind: "burner", name: "Devnet burner", address: addr });
  try { localStorage.setItem(LAST_KEY, "__burner"); } catch {}
}

export async function disconnect() {
  const w = active?.wallet;
  active?.off?.();
  active = null;
  burner = null;
  $wallet.set(null);
  try { localStorage.removeItem(LAST_KEY); } catch {}
  await (w?.features as unknown as Partial<DisconnectFeature> | undefined)?.["standard:disconnect"]?.disconnect().catch(() => {});
}

export async function restore() {
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_KEY); } catch {}
  if (!last) return;
  if (last === "__burner") return TESTNET ? connectBurner() : undefined;
  const w = solanaWallets().find((x) => x.name === last);
  if (w) await connectStandard(w, true).catch(() => {});
}

export async function signWire(wire: Uint8Array, signWithBurner: () => Promise<Uint8Array>): Promise<Uint8Array> {
  if (burner) return signWithBurner();
  if (!active) throw new Error("Connect a wallet first");
  const feature = (active.wallet.features as unknown as SolanaSignTransactionFeature)[SolanaSignTransaction];
  const [out] = await feature.signTransaction({ account: active.account, transaction: wire, chain: CHAIN });
  return out.signedTransaction;
}

export const burnerKeys = () => burner?.keys ?? null;
