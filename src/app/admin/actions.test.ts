/**
 * The admin actions' wiring (PR-51).
 *
 * Twenty `actions.ts` files, all the same three lines: read the session, parse
 * the form, hand both to a query module that calls `requireRole`. The query
 * modules are tested; the parsers are tested; the join between them was not, so
 * an action that dropped `currentUser()` and passed a literal, or passed the id
 * where the payload goes, would have shipped green.
 *
 * Two kinds of test, because twenty near-identical files deserve one structural
 * assertion and a couple of real ones rather than twenty copies of the same
 * mock:
 *
 * 1. **A scan over every admin action file**, asserting the shape that makes
 *    the gate work at all — the session comes from `currentUser()` and is what
 *    reaches the query. An action that invented a user, or read a role out of
 *    the form, is the failure this catches.
 * 2. **Behavioural tests of two representatives** — an area (the simplest) and
 *    an arancel (the money path) — for the properties a scan cannot see.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN = resolve(__dirname);

function actionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return actionFiles(path);
    return entry.name === 'actions.ts' ? [path] : [];
  });
}

const ACTION_FILES = actionFiles(ADMIN);

describe('every admin action file', () => {
  it('finds them all — a scan that matched nothing proves nothing', () => {
    expect(ACTION_FILES.length).toBeGreaterThan(15);
  });

  it.each(ACTION_FILES.map((file) => [relative(ADMIN, file), file]))(
    '%s reads the session from currentUser() and never from the form',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain("import { currentUser } from '@/lib/auth/session'");
      expect(source).toMatch(/await currentUser\(\)/);
      // A role or a user id read out of `formData` is the mistake this looks
      // for: the form is the caller's, and the caller is who we are gating.
      expect(source).not.toMatch(/formData\.get\('(role|userId|user_id)'\)/);
    },
  );

  it.each(ACTION_FILES.map((file) => [relative(ADMIN, file), file]))(
    '%s passes that session into the query rather than calling it bare',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      // Every mutation in these files takes `user` first. A call with no `user`
      // argument is a query that will read the session from nowhere.
      const bareCalls = [...source.matchAll(/await ([a-z][A-Za-z]*)\(\s*\)/g)]
        .map((match) => match[1]!)
        .filter((name) => name !== 'currentUser' && name !== 'headers' && name !== 'cookies');
      expect(bareCalls).toEqual([]);
    },
  );
});

/* -------------------------------------------------------------------------- */

const updateArea = vi.fn();
const createPrice = vi.fn();
const updatePrice = vi.fn();
const retirePrice = vi.fn();

let sessionUser: unknown = {
  id: 2,
  role: 'editor',
  institutionId: null,
  mustChangePassword: false,
};

vi.mock('@/lib/auth/session', () => ({ currentUser: async () => sessionUser }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock('@/db/queries/admin/areas', () => ({ updateArea: (...a: unknown[]) => updateArea(...a) }));
vi.mock('@/db/queries/admin/prices', () => ({
  createPrice: (...a: unknown[]) => createPrice(...a),
  updatePrice: (...a: unknown[]) => updatePrice(...a),
  retirePrice: (...a: unknown[]) => retirePrice(...a),
}));

const { updateAreaAction } = await import('./areas/actions');
const { createPriceAction, retirePriceAction } = await import('./aranceles/actions');

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  sessionUser = { id: 2, role: 'editor', institutionId: null, mustChangePassword: false };
  updateArea.mockReset().mockResolvedValue(undefined);
  createPrice.mockReset().mockResolvedValue(undefined);
  updatePrice.mockReset().mockResolvedValue(undefined);
  retirePrice.mockReset().mockResolvedValue(undefined);
});

describe('updateAreaAction', () => {
  it('refuses an empty name before the query runs', async () => {
    const state = await updateAreaAction(3, {}, form({ nameEs: '   ' }));
    expect(state.errors).toBeTruthy();
    expect(updateArea).not.toHaveBeenCalled();
  });

  it('hands the session, the id and the parsed payload through, in that order', async () => {
    await expect(
      updateAreaAction(3, {}, form({ nameEs: 'Ingeniería', sortOrder: '3' })),
    ).rejects.toThrow('redirect:/admin/areas');
    expect(updateArea).toHaveBeenCalledWith(
      sessionUser,
      3,
      expect.objectContaining({ nameEs: 'Ingeniería', sortOrder: 3 }),
    );
  });

  it('reports the query’s own refusal instead of swallowing it', async () => {
    updateArea.mockRejectedValue(new Error('No tenés permiso para esto.'));
    const state = await updateAreaAction(3, {}, form({ nameEs: 'Ingeniería', sortOrder: '3' }));
    expect(state.formError).toBe('No tenés permiso para esto.');
  });

  it('passes a null session on rather than short-circuiting the gate itself', async () => {
    // The action must not decide authorization — `updateArea` calls
    // `requireRole` and is the only place that answer is made (rule 4).
    sessionUser = null;
    updateArea.mockRejectedValue(new Error('Iniciá sesión.'));
    const state = await updateAreaAction(3, {}, form({ nameEs: 'Ingeniería', sortOrder: '3' }));
    expect(updateArea).toHaveBeenCalledWith(null, 3, expect.anything());
    expect(state.formError).toBe('Iniciá sesión.');
  });
});

describe('the money path', () => {
  it('refuses a malformed arancel before anything is written', async () => {
    const state = await createPriceAction({}, form({ offeringId: 'no-es-un-numero' }));
    expect(state.errors).toBeTruthy();
    expect(createPrice).not.toHaveBeenCalled();
  });

  it('never lets the form choose which row is retired — the id is an argument', async () => {
    await expect(retirePriceAction(77)).rejects.toThrow('redirect:/admin/aranceles');
    expect(retirePrice).toHaveBeenCalledWith(sessionUser, 77);
  });
});
