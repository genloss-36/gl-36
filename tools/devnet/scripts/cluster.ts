import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AccountRole,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { SYSTEM_PROGRAM, decodeCollection } from "@gl36/sdk";

export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const WS_URL = process.env.WS_URL ?? RPC_URL.replace(/^http/, "ws").replace(":8899", ":8900");
export const local = RPC_URL.includes("127.0.0.1") || RPC_URL.includes("localhost");
export const explorer = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=` +
  (local ? `custom&customUrl=${encodeURIComponent(RPC_URL)}` : "devnet");

export const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
export const loadKey = (p: string) =>
  createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(root(p), "utf8"))));

export const rpc = createSolanaRpc(RPC_URL);
const sendAndConfirm = sendAndConfirmTransactionFactory({
  rpc,
  rpcSubscriptions: createSolanaRpcSubscriptions(WS_URL),
});

export interface Row { step: string; cu: bigint; fee: bigint; sig: string }
export const rows: Row[] = [];

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function call<T>(f: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      if ((e as { context?: { statusCode?: number } }).context?.statusCode !== 429 || i >= 8) throw e;
      await pause(2_000 * (i + 1));
    }
  }
}

export async function send(step: string, payer: KeyPairSigner, ixs: Instruction[]) {
  if (!local) await pause(1_500);
  const { value: blockhash } = await call(() => rpc.getLatestBlockhash({ commitment: "confirmed" }).send());
  const tx = await pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
    (m) => signTransactionMessageWithSigners(m),
  );
  const sig = getSignatureFromTransaction(tx);
  try {
    await sendAndConfirm(tx as never, { commitment: "confirmed" });
  } catch (e) {
    const t = await call(() => rpc.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).send());
    console.error(`✖ ${step} failed`, t?.meta?.logMessages ?? e);
    throw e;
  }
  const t = await call(() => rpc.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).send());
  const row = { step, cu: BigInt(t?.meta?.computeUnitsConsumed ?? 0), fee: BigInt(t?.meta?.fee ?? 0), sig };
  rows.push(row);
  console.log(`✔ ${step.padEnd(28)} ${String(row.cu).padStart(6)} CU  ${explorer(sig)}`);
  return row;
}

export function systemTransfer(from: KeyPairSigner, to: Address, lamports: bigint): Instruction {
  const data = new Uint8Array(12);
  const v = new DataView(data.buffer);
  v.setUint32(0, 2, true);
  v.setBigUint64(4, lamports, true);
  return {
    programAddress: SYSTEM_PROGRAM,
    accounts: [
      { address: from.address, role: AccountRole.WRITABLE_SIGNER, signer: from },
      { address: to, role: AccountRole.WRITABLE },
    ],
    data,
  } as Instruction;
}

export const balance = async (a: Address) =>
  (await call(() => rpc.getBalance(a, { commitment: "confirmed" }).send())).value;

export async function collectionState(a: Address) {
  const { value } = await call(() => rpc.getAccountInfo(a, { encoding: "base64", commitment: "confirmed" }).send());
  if (!value) return null;
  const data = new Uint8Array(Buffer.from(value.data[0], "base64"));
  return { ...decodeCollection(data), lamports: value.lamports, len: data.length };
}

export const sol = (l: bigint) => (Number(l) / 1e9).toFixed(6);
