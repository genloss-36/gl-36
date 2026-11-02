import { MAX_PRICE, PRICE_UNIT } from "./constants.ts";

const DECIMALS = 6;

function check(price: number) {
  if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
    throw new RangeError(`price must be an integer from 0 to ${MAX_PRICE} units of 1,000 lamports, got ${price}`);
  }
}

export function priceToLamports(price: number): bigint {
  check(price);
  return BigInt(price) * PRICE_UNIT;
}

export function lamportsToPrice(lamports: bigint): number {
  if (lamports % PRICE_UNIT !== 0n) throw new RangeError(`${lamports} lamports is not a whole number of price units`);
  const price = lamports / PRICE_UNIT;
  if (price < 0n || price > BigInt(MAX_PRICE)) throw new RangeError(`${lamports} lamports is outside the u32 price range`);
  return Number(price);
}

export function solToPrice(sol: string | number): number {
  const text = typeof sol === "number" ? sol.toFixed(DECIMALS) : sol.trim();
  const m = /^(\d*)(?:[.,](\d*))?$/.exec(text);
  if (!m || (m[1] === "" && !m[2])) throw new RangeError(`not a SOL amount: ${sol}`);
  const frac = (m[2] ?? "").replace(/0+$/, "");
  if (frac.length > DECIMALS) throw new RangeError(`prices go down to 0.000001 SOL, got ${sol}`);
  const price = Number(BigInt(m[1] || "0") * 10n ** BigInt(DECIMALS) + BigInt(frac.padEnd(DECIMALS, "0") || "0"));
  check(price);
  return price;
}

export function priceToSol(price: number): string {
  check(price);
  const whole = Math.floor(price / 10 ** DECIMALS);
  const frac = String(price % 10 ** DECIMALS).padStart(DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}
