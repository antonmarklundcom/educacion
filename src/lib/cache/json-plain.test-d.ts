/**
 * The round-trip guard, tested by the compiler.
 *
 * This file runs under `npm run typecheck`, not under vitest — a guarantee made
 * by a type has to be checked by `tsc` or it is not checked at all. Every
 * `@ts-expect-error` below is an assertion: `tsc` fails if the line it marks
 * *stops* being an error, which is what happens the moment `JsonPlain` is
 * weakened or `load`'s return type is relaxed to `Promise<Wire>`.
 *
 * The independent review of PR-43 found the first version of `JsonPlain`
 * catching only `Date` while three comments claimed it caught everything JSON
 * would change. This file is the answer to that: the claim is now a list of
 * cases, and each case is compiled.
 */

import { cachedRead, passthrough } from './next-cache';

/* -------------------------------------------------------------------------- */
/* Accepted: the shapes JSON round-trips exactly                              */
/* -------------------------------------------------------------------------- */

export const primitives = () =>
  cachedRead<{ n: number; s: string; b: boolean; nothing: null }, unknown>({
    name: 'probe',
    key: 'k',
    load: async () => ({ n: 1, s: 'a', b: true, nothing: null }),
    decode: passthrough,
  });

export const nested = () =>
  cachedRead<{ rows: { id: number; label: string | null }[] }, unknown>({
    name: 'probe',
    key: 'k',
    load: async () => ({ rows: [{ id: 1, label: null }] }),
    decode: passthrough,
  });

/* -------------------------------------------------------------------------- */
/* Rejected: each for its own reason (see `JsonPlain`'s doc comment)          */
/* -------------------------------------------------------------------------- */

export const rejectsDate = () =>
  cachedRead<{ at: Date }, unknown>({
    name: 'probe',
    key: 'k',
    // @ts-expect-error a Date is an ISO string on a hit and a Date on a miss
    load: async () => ({ at: new Date() }),
    decode: passthrough,
  });

export const rejectsMap = () =>
  cachedRead<{ m: Map<number, string> }, unknown>({
    name: 'probe',
    key: 'k',
    // @ts-expect-error a Map serializes to {}
    load: async () => ({ m: new Map<number, string>() }),
    decode: passthrough,
  });

export const rejectsSet = () =>
  cachedRead<{ s: Set<string> }, unknown>({
    name: 'probe',
    key: 'k',
    // @ts-expect-error a Set serializes to {}
    load: async () => ({ s: new Set<string>() }),
    decode: passthrough,
  });

export const rejectsBigint = () =>
  cachedRead<{ big: bigint }, unknown>({
    name: 'probe',
    key: 'k',
    // @ts-expect-error JSON.stringify throws on a bigint
    // (`BigInt(1)`, not `1n` — a bigint *literal* needs an ES2020 target, and
    //  that error would satisfy the directive without proving anything.)
    load: async () => ({ big: BigInt(1) }),
    decode: passthrough,
  });

export const rejectsOptional = () =>
  cachedRead<{ maybe?: string }, unknown>({
    name: 'probe',
    key: 'k',
    // @ts-expect-error an absent key on a hit is a different shape from an undefined one on a miss
    load: async () => ({}),
    decode: passthrough,
  });

export const rejectsSymbol = () =>
  cachedRead<{ tag: symbol }, unknown>({
    name: 'probe',
    key: 'k',
    // @ts-expect-error a symbol is dropped silently
    load: async () => ({ tag: Symbol('x') }),
    decode: passthrough,
  });

export const rejectsFunction = () =>
  cachedRead<{ fn: () => number }, unknown>({
    name: 'probe',
    key: 'k',
    // @ts-expect-error a function is dropped silently
    load: async () => ({ fn: () => 1 }),
    decode: passthrough,
  });

export const rejectsNestedDate = () =>
  cachedRead<{ rows: { at: Date }[] }, unknown>({
    name: 'probe',
    key: 'k',
    // @ts-expect-error the guard has to reach inside arrays, which is where the rows live
    load: async () => ({ rows: [{ at: new Date() }] }),
    decode: passthrough,
  });
