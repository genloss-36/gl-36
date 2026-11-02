import { isSolanaError, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM, type Address } from "@solana/kit";
import { SYSTEM_PROGRAM } from "./constants.ts";

export const ERR = {
  SoldOut: 1,
  BadBatch: 2,
  NotOwner: 3,
  NotListed: 4,
  PriceAboveMax: 5,
  SellerMismatch: 6,
  SelfBuy: 7,
  NotClosed: 8,
  AlreadySettled: 9,
  MintClosed: 10,
  BadFee: 11,
  BadSupply: 12,
  WrongCreator: 13,
  WrongTreasury: 14,
  BadId: 15,
  SameOwner: 16,
  BadSysvar: 17,
  TooEarly: 18,
} as const;

export type ErrorName = keyof typeof ERR;

const NAMES = new Map<number, ErrorName>(Object.entries(ERR).map(([k, v]) => [v, k as ErrorName]));

export const errorName = (code: number): ErrorName | undefined => NAMES.get(code);

export interface ProgramError {
  code: number;
  name: ErrorName | undefined;
  program?: Address;
  instructionIndex?: number;
}

const FAILED = /^Program (\w+) failed: custom program error: 0x([0-9a-f]+)/i;
const CUSTOM = /custom program error: 0x([0-9a-f]+)/i;

function chain(error: unknown): unknown[] {
  const out: unknown[] = [];
  for (let e = error, depth = 0; e != null && depth < 8; depth++) {
    out.push(e);
    e = typeof e === "object" ? (e as { cause?: unknown }).cause : undefined;
  }
  return out;
}

function logsOf(error: unknown): string[] {
  if (Array.isArray(error)) return error.filter((l): l is string => typeof l === "string");
  for (const e of chain(error)) {
    const logs = (e as { context?: { logs?: unknown } })?.context?.logs ?? (e as { logs?: unknown })?.logs;
    if (Array.isArray(logs)) return logs.filter((l): l is string => typeof l === "string");
  }
  return [];
}

function named(code: number, program: Address | undefined, programId: Address | undefined): ErrorName | undefined {
  if (program === undefined) return errorName(code);
  if (programId !== undefined) return program === programId ? errorName(code) : undefined;
  return program === SYSTEM_PROGRAM ? undefined : errorName(code);
}

export function parseProgramError(error: unknown, options: { programId?: Address } = {}): ProgramError | null {
  for (const line of logsOf(error)) {
    const m = FAILED.exec(line);
    if (m) {
      const program = m[1] as Address;
      const code = Number.parseInt(m[2], 16);
      return { code, name: named(code, program, options.programId), program };
    }
  }
  for (const e of chain(error)) {
    if (isSolanaError(e, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM)) {
      const { code, index } = e.context;
      return { code, name: errorName(code), instructionIndex: index };
    }
  }
  for (const e of chain(error)) {
    const text = typeof e === "string" ? e : e instanceof Error ? e.message : "";
    const m = CUSTOM.exec(text);
    if (m) {
      const code = Number.parseInt(m[1], 16);
      return { code, name: errorName(code) };
    }
  }
  return null;
}
