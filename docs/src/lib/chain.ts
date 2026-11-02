import { decodeCollection, type Collection } from "@gl-36/sdk";
import { RPC } from "./config";

const RPC_KEY = "gl36.docs.rpc";

export function rpcUrl(): string {
  try {
    return localStorage.getItem(RPC_KEY) || RPC;
  } catch {
    return RPC;
  }
}

export function setRpcUrl(url: string) {
  try {
    if (url && url !== RPC) localStorage.setItem(RPC_KEY, url);
    else localStorage.removeItem(RPC_KEY);
  } catch {
  }
}

async function call<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? "RPC error");
  return body.result as T;
}

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface Account {
  address: string;
  data: Uint8Array;
  lamports: bigint;
  owner: string;
  col: Collection;
}

export async function fetchCollection(address: string): Promise<Account> {
  const r = await call<{ value: null | { data: [string, string]; lamports: number; owner: string } }>(
    "getAccountInfo",
    [address, { encoding: "base64", commitment: "confirmed" }],
  );
  if (!r.value) throw new Error("No account at this address on this cluster.");
  const data = b64(r.value.data[0]);
  return { address, data, lamports: BigInt(r.value.lamports), owner: r.value.owner, col: decodeCollection(data) };
}

let perByte: Promise<number> | undefined;
export function lamportsPerByte(): Promise<number> {
  return (perByte ??= call<number>("getMinimumBalanceForRentExemption", [0])
    .then((v) => v / 128)
    .catch((e) => {
      perByte = undefined;
      throw e;
    }));
}
