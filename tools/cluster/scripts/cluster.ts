import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AccountRole,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
  type Signature,
} from "@solana/kit";
import { SYSTEM_PROGRAM, decodeCollection } from "@gl-36/sdk";

export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
export const RPC_URL = process.env.RPC_URL ?? PUBLIC_RPC;
export const local = RPC_URL.includes("127.0.0.1") || RPC_URL.includes("localhost");
export const explorer = (sig: string) => (local ? sig : `https://solscan.io/tx/${sig}`);

export const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
export const loadKey = (p: string) =>
  createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(root(p), "utf8"))));

export const rpc = createSolanaRpc(RPC_URL);

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

const landed = async (sig: Signature) => {
  for (let i = 0; i < 10; i++) {
    const t = await call(() => rpc.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed", encoding: "json" }).send());
    if (t) return t;
    await pause(1_000);
  }
  return null;
};

export async function send(step: string, payer: KeyPairSigner, ixs: Instruction[]) {
  if (!local) await pause(1_500);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { value: blockhash } = await call(() => rpc.getLatestBlockhash({ commitment: "confirmed" }).send());
    const tx = await pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(ixs, m),
      (m) => signTransactionMessageWithSigners(m),
    );
    const sig = getSignatureFromTransaction(tx);
    const wire = getBase64EncodedWireTransaction(tx);
    await call(() => rpc.sendTransaction(wire, { encoding: "base64", preflightCommitment: "confirmed" }).send());
    for (let i = 1; ; i++) {
      await pause(1_000);
      const status = (await call(() => rpc.getSignatureStatuses([sig]).send())).value[0];
      if (status?.err) {
        console.error(`✖ ${step} failed`, (await landed(sig))?.meta?.logMessages ?? status.err);
        throw new Error(`${step} failed: ${JSON.stringify(status.err)}`);
      }
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
        const t = await landed(sig);
        console.log(`✔ ${step.padEnd(28)} ${String(t?.meta?.computeUnitsConsumed ?? 0).padStart(6)} CU  ${explorer(sig)}`);
        return sig;
      }
      if (i % 5 === 0) {
        const height = await call(() => rpc.getBlockHeight({ commitment: "confirmed" }).send());
        if (height > blockhash.lastValidBlockHeight) break;
        await call(() => rpc.sendTransaction(wire, { encoding: "base64", skipPreflight: true }).send()).catch(() => {});
      }
    }
    console.log(`… ${step}: blockhash expired before it landed, signing again (${attempt}/3)`);
  }
  throw new Error(`${step}: not confirmed after 3 blockhashes`);
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
  if (!value || !value.data[0]) return null;
  const data = new Uint8Array(Buffer.from(value.data[0], "base64"));
  return { ...decodeCollection(data), lamports: value.lamports, len: data.length };
}

export const sol = (l: bigint) => (Number(l) / 1e9).toFixed(6);
