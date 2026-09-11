/**
 * A fake `Db` for the arancel-import tests (PR-61).
 *
 * ### Why a fake and not a MySQL
 *
 * CI has no database (`architecture.md` §34), and the thing under test is a
 * *decision procedure*: which verdict does each row get, and what is written for
 * the ones that pass. That is exactly what a fake can answer honestly. What it
 * cannot answer — that `current_offering_id`'s UNIQUE index really does refuse a
 * second current price — is asserted here as the *behaviour that keeps it true*
 * (the previous row is demoted in the same transaction), and the constraint
 * itself is the database's job and is declared in `schema.ts`.
 *
 * ### How it reads a query
 *
 * Drizzle builds its `where` into an SQL object whose chunks carry the bound
 * parameters. Rather than mock out the query builder's shape per call site, the
 * fake walks those chunks and takes the scalar parameters in order — which is
 * all these two queries need: four slugs for the offering lookup, one offering
 * id for the current-price lookup.
 */

import { offerings, prices } from '@/db/schema';

export interface FakeOffering {
  id: number;
  institutionSlug: string;
  programSlug: string;
  campusSlug: string;
  modality: string;
}

export interface FakePrice {
  id: number;
  offeringId: number;
  isCurrent: boolean;
}

/** Every scalar bound into a condition, in the order the SQL names them. */
export function boundParams(node: unknown, out: unknown[] = []): unknown[] {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) boundParams(child, out);
    return out;
  }
  const obj = node as Record<string, unknown>;
  if ('value' in obj && !('queryChunks' in obj)) {
    const value = obj.value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out.push(value);
    }
  }
  if (Array.isArray(obj.queryChunks)) boundParams(obj.queryChunks, out);
  return out;
}

export interface FakeDbState {
  offerings: FakeOffering[];
  prices: FakePrice[];
  /** Every row handed to `insert(prices)`, in order. */
  inserted: Record<string, unknown>[];
  /** Every `activity_log` row written, in order. */
  activity: Record<string, unknown>[];
  /** Price ids demoted out of `is_current`, in order. */
  demoted: number[];
  /** How many transactions were opened — one per written row, by design. */
  transactions: number;
  /** Set by a row id: make that insert throw, to test partial application. */
  failOnOfferingId?: number;
}

export function fakeDbState(overrides: Partial<FakeDbState> = {}): FakeDbState {
  return {
    offerings: [],
    prices: [],
    inserted: [],
    activity: [],
    demoted: [],
    transactions: 0,
    ...overrides,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- a stand-in for Drizzle's
   builder chain; typing it faithfully would be re-implementing Drizzle. */
export function makeFakeDb(state: FakeDbState): any {
  let nextPriceId = 9000;

  const select = () => {
    let table: unknown = null;
    let condition: unknown = null;
    const builder: any = {
      from(t: unknown) {
        table = t;
        return builder;
      },
      innerJoin: () => builder,
      orderBy: () => builder,
      where(cond: unknown) {
        condition = cond;
        return builder;
      },
      limit() {
        const params = boundParams(condition);
        if (table === offerings) {
          const [institutionSlug, programSlug, campusSlug, modality] = params as string[];
          return Promise.resolve(
            state.offerings
              .filter(
                (row) =>
                  row.institutionSlug === institutionSlug &&
                  row.programSlug === programSlug &&
                  row.campusSlug === campusSlug &&
                  row.modality === modality,
              )
              .map((row) => ({ id: row.id })),
          );
        }
        if (table === prices) {
          const offeringId = params.find((value) => typeof value === 'number') as number;
          return Promise.resolve(
            state.prices.filter((row) => row.offeringId === offeringId && row.isCurrent),
          );
        }
        return Promise.resolve([]);
      },
    };
    return builder;
  };

  const db: any = {
    select,
    insert(table: unknown) {
      return {
        values(row: Record<string, unknown>) {
          if (table === prices) {
            if (row.offeringId === state.failOnOfferingId) {
              return Promise.reject(new Error('Duplicate entry for key current_offering_id'));
            }
            nextPriceId += 1;
            state.inserted.push(row);
            state.prices.push({
              id: nextPriceId,
              offeringId: row.offeringId as number,
              isCurrent: true,
            });
            return Promise.resolve([{ insertId: nextPriceId }]);
          }
          state.activity.push(row);
          return Promise.resolve([{ insertId: state.activity.length }]);
        },
      };
    },
    update() {
      return {
        set(values: Record<string, unknown>) {
          return {
            where(cond: unknown) {
              const id = boundParams(cond).find((value) => typeof value === 'number') as number;
              if (values.isCurrent === false) {
                state.demoted.push(id);
                const row = state.prices.find((entry) => entry.id === id);
                if (row) row.isCurrent = false;
              }
              return Promise.resolve([]);
            },
          };
        },
      };
    },
    async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
      state.transactions += 1;
      return callback(db);
    },
  };

  return db;
}
