import { PRICE_UNIT } from "@gl36/sdk";

export const short = (a: string, n = 4) => `${a.slice(0, n)}…${a.slice(-n)}`;

export function sol(lamports: bigint | number, digits = 4): string {
  const v = Number(lamports) / 1e9;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export const priceSol = (units: number) => sol(BigInt(units) * PRICE_UNIT, 6);

export function parsePrice(text: string): number | null {
  const v = Number(text.replace(",", "."));
  if (!Number.isFinite(v) || v <= 0) return null;
  const units = Math.round(v * 1e6);
  return units >= 1 && units <= 0xffffffff ? units : null;
}

export const pad = (n: number, w = 4) => String(n).padStart(w, "0");
