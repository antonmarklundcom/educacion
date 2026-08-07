import { describe, expect, it, vi } from 'vitest';

import { loadTopCareers, type AreaSupply } from './top-careers';

import type { CareerWithStats } from '@/lib/careers';

function career(
  nameEs: string,
  areaSlug: string,
  offeringCount: number,
  institutionCount = 1,
): CareerWithStats {
  return {
    id: Math.abs(hash(nameEs)),
    slug: nameEs.toLowerCase(),
    nameEs,
    levelDefault: 'grado',
    descriptionMd: null,
    areaId: Math.abs(hash(areaSlug)),
    areaSlug: null,
    areaName: null,
    stats: { offeringCount, institutionCount, cityCount: 1 },
  };
}

function hash(value: string): number {
  return [...value].reduce((acc, char) => acc * 31 + char.charCodeAt(0), 7) % 100000;
}

function loaderFor(byArea: Record<string, CareerWithStats[]>) {
  return vi.fn(async (slug: string) => byArea[slug] ?? []);
}

const areas: AreaSupply[] = [
  { slug: 'salud', offeringCount: 120 },
  { slug: 'ingenieria', offeringCount: 90 },
  { slug: 'derecho', offeringCount: 40 },
  { slug: 'deportes', offeringCount: 0 },
];

describe('loadTopCareers', () => {
  it('ranks careers by published offerings across areas', async () => {
    const load = loaderFor({
      salud: [career('Medicina', 'salud', 60), career('Enfermería', 'salud', 60, 9)],
      ingenieria: [career('Informática', 'ingenieria', 70)],
      derecho: [career('Derecho', 'derecho', 40)],
    });

    const top = await loadTopCareers(areas, 3, load);

    expect(top.map((entry) => entry.nameEs)).toEqual(['Informática', 'Enfermería', 'Medicina']);
  });

  it('stops walking once no unvisited area can beat the cut-off', async () => {
    const load = loaderFor({
      salud: [career('Medicina', 'salud', 60), career('Enfermería', 'salud', 50)],
      ingenieria: [career('Informática', 'ingenieria', 45)],
      derecho: [career('Derecho', 'derecho', 40)],
    });

    const top = await loadTopCareers(areas, 2, load);

    expect(top.map((entry) => entry.nameEs)).toEqual(['Medicina', 'Enfermería']);
    // `derecho` (40 total) cannot reach the 50-offering cut-off, so it is never read.
    expect(load).toHaveBeenCalledWith('salud');
    expect(load).toHaveBeenCalledWith('ingenieria');
    expect(load).not.toHaveBeenCalledWith('derecho');
  });

  it('keeps reading while an area could still tie the cut-off', async () => {
    const load = loaderFor({
      salud: [career('Medicina', 'salud', 60), career('Enfermería', 'salud', 40)],
      ingenieria: [career('Informática', 'ingenieria', 20)],
      derecho: [career('Abogacía', 'derecho', 40, 5)],
    });

    const top = await loadTopCareers(areas, 2, load);

    // `derecho` totals exactly 40 and holds a career that ties Enfermería; the
    // tie is broken by institution count, not by area order.
    expect(load).toHaveBeenCalledWith('derecho');
    expect(top.map((entry) => entry.nameEs)).toEqual(['Medicina', 'Abogacía']);
  });

  it('skips areas with no published supply and careers with none', async () => {
    const load = loaderFor({
      salud: [career('Medicina', 'salud', 10), career('Fonoaudiología', 'salud', 0)],
    });

    const top = await loadTopCareers(
      [{ slug: 'salud', offeringCount: 10 }, ...areas.slice(3)],
      5,
      load,
    );

    expect(top.map((entry) => entry.nameEs)).toEqual(['Medicina']);
    expect(load).not.toHaveBeenCalledWith('deportes');
  });

  it('returns nothing when the index is empty', async () => {
    const load = loaderFor({});
    expect(await loadTopCareers([{ slug: 'salud', offeringCount: 0 }], 8, load)).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });
});
