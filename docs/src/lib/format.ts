export const short = (a: string, n = 4) => `${a.slice(0, n)}…${a.slice(-n)}`;

export const int = (n: number | bigint) => n.toLocaleString("en-US");

export function sol(lamports: number | bigint, digits = 6): string {
  const v = Number(lamports) / 1e9;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export const isZero = (b: Uint8Array) => b.every((x) => x === 0);

export const pad = (n: number, w = 4) => String(n).padStart(w, "0");
