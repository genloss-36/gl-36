import type { Address } from "@solana/kit";

export type Gl36Event =
  | { type: "init"; maxSupply: number }
  | { type: "mint"; firstId: number; count: number }
  | { type: "transfer"; id: number }
  | { type: "list"; id: number; price: number }
  | { type: "buy"; id: number; price: number }
  | { type: "close"; minted: number }
  | { type: "settle" }
  | { type: "rearm" }
  | { type: "withdraw"; lamports: bigint };

const INVOKE = /^Program (\w+) invoke \[\d+\]$/;
const EXIT = /^Program (\w+) (success|failed)/;
const LOG = "Program log: ";

const ints = (parts: string[], n: number) =>
  parts.length === n && parts.every((p) => /^\d+$/.test(p)) ? parts.map(Number) : null;

function parseEvent(message: string): Gl36Event | null {
  const [kind, ...rest] = message.trim().split(/\s+/);
  switch (kind) {
    case "init": {
      const v = ints(rest, 1);
      return v && { type: "init", maxSupply: v[0] };
    }
    case "mint": {
      const v = ints(rest, 2);
      return v && { type: "mint", firstId: v[0], count: v[1] };
    }
    case "xfer": {
      const v = ints(rest, 1);
      return v && { type: "transfer", id: v[0] };
    }
    case "list": {
      const v = ints(rest, 2);
      return v && { type: "list", id: v[0], price: v[1] };
    }
    case "buy": {
      const v = ints(rest, 2);
      return v && { type: "buy", id: v[0], price: v[1] };
    }
    case "close": {
      const v = ints(rest, 1);
      return v && { type: "close", minted: v[0] };
    }
    case "settle":
      return rest.length === 0 ? { type: "settle" } : null;
    case "rearm":
      return rest.length === 0 ? { type: "rearm" } : null;
    case "withdraw":
      return rest.length === 1 && /^\d+$/.test(rest[0]) ? { type: "withdraw", lamports: BigInt(rest[0]) } : null;
    default:
      return null;
  }
}

export function parseLogs(logs: readonly string[], programId: Address): Gl36Event[] {
  const stack: string[] = [];
  const events: Gl36Event[] = [];
  for (const line of logs) {
    const invoke = INVOKE.exec(line);
    if (invoke) {
      stack.push(invoke[1]);
      continue;
    }
    if (EXIT.test(line)) {
      stack.pop();
      continue;
    }
    if (stack.at(-1) !== programId || !line.startsWith(LOG)) continue;
    const event = parseEvent(line.slice(LOG.length));
    if (event) events.push(event);
  }
  return events;
}
