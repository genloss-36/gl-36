import { atom } from "nanostores";
import type { Collection } from "@gl36/sdk";
import { COLLECTIONS, type CollectionCfg } from "./config";

const COL_KEY = "genloss.collection";

function initialCollection(): string {
  try {
    const fromUrl = new URLSearchParams(location.search).get("c");
    const saved = localStorage.getItem(COL_KEY);
    const ids = COLLECTIONS.map((c) => c.id);
    return [fromUrl, saved].find((v) => v && ids.includes(v)) ?? COLLECTIONS[0]?.id ?? "";
  } catch {
    return COLLECTIONS[0]?.id ?? "";
  }
}

export const $collectionId = atom<string>(initialCollection());
$collectionId.listen((id) => {
  try { localStorage.setItem(COL_KEY, id); } catch {}
});

export const collectionCfg = (): CollectionCfg | undefined =>
  COLLECTIONS.find((c) => c.id === $collectionId.get()) ?? COLLECTIONS[0];

export interface ChainState {
  cfgId: string;
  col: Collection;
  lamports: bigint;
  revealed: boolean;
  fetchedAt: number;
}

export const $chain = atom<ChainState | null>(null);
export const $chainError = atom<string | null>(null);

export interface WalletState {
  name: string;
  icon?: string;
  address: string;
}
export const $wallet = atom<WalletState | null>(null);
export const $balance = atom<bigint | null>(null);

const SOUND_KEY = "genloss.sound";

export const $sound = atom<boolean>((() => {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
})());
$sound.listen((on) => {
  try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch {}
});
export const $voice = atom<string | null>(null);
export const $selected = atom<number | null>(null);

export interface Toast {
  id: number;
  kind: "info" | "ok" | "error";
  text: string;
  link?: string;
}
export const $toasts = atom<Toast[]>([]);
let toastId = 0;
export function toast(kind: Toast["kind"], text: string, link?: string) {
  const t = { id: ++toastId, kind, text, link };
  $toasts.set([...$toasts.get(), t].slice(-4));
  setTimeout(() => $toasts.set($toasts.get().filter((x) => x.id !== t.id)), kind === "error" ? 9000 : 6000);
}
