import { describe, expect, it } from 'vitest';

import {
  ADMIN_ENTITIES,
  ENTITY_DEFS,
  deriveSystemFields,
  isAdminEntity,
  labelForValue,
  parseEntityForm,
  type FormLike,
} from './entities';

function form(values: Record<string, string>): FormLike {
  return { get: (name) => values[name] ?? null };
}

describe('the registry', () => {
  it('describes every entity, and every list column is a declared field', () => {
    for (const entity of ADMIN_ENTITIES) {
      const def = ENTITY_DEFS[entity];
      const names = new Set(def.fields.map((field) => field.name));
      for (const column of def.listColumns) expect(names.has(column)).toBe(true);
      expect(names.has(def.titleField)).toBe(true);
      if (def.listFilter) expect(names.has(def.listFilter.field)).toBe(true);
    }
  });

  it('gives every reference field a reference kind', () => {
    for (const entity of ADMIN_ENTITIES) {
      for (const field of ENTITY_DEFS[entity].fields) {
        if (field.kind === 'reference') expect(field.reference).toBeTruthy();
        if (field.kind === 'enum') expect(field.options?.length).toBeGreaterThan(0);
      }
    }
  });

  it('rejects an unknown entity key', () => {
    expect(isAdminEntity('instituciones')).toBe(true);
    expect(isAdminEntity('users')).toBe(false);
  });
});

describe('parseEntityForm', () => {
  const def = ENTITY_DEFS.instituciones;

  it('reads a valid institution', () => {
    const { values, errors } = parseEntityForm(
      def,
      form({
        nameOfficial: '  Universidad Nacional de Asunción  ',
        nameShort: 'UNA',
        management: 'publica',
        type: 'universidad',
        status: 'published',
        website: 'https://www.una.py',
        whatsappE164: '+595981123456',
      }),
    );
    expect(errors).toEqual({});
    expect(values.nameOfficial).toBe('Universidad Nacional de Asunción');
    expect(values.whatsappE164).toBe('+595981123456');
  });

  it('turns an empty optional field into null, never an empty string', () => {
    const { values } = parseEntityForm(
      def,
      form({
        nameOfficial: 'X',
        nameShort: 'X',
        management: 'publica',
        type: 'otro',
        status: 'draft',
      }),
    );
    expect(values.website).toBeNull();
    expect(values.foundedYear).toBeNull();
  });

  it('reports missing required fields per field', () => {
    const { errors } = parseEntityForm(def, form({}));
    expect(errors.nameOfficial).toBeTruthy();
    expect(errors.management).toBeTruthy();
    expect(errors.website).toBeUndefined();
  });

  it('refuses an enum value outside the schema list', () => {
    const { errors } = parseEntityForm(
      def,
      form({
        nameOfficial: 'X',
        nameShort: 'X',
        management: 'estatal',
        type: 'otro',
        status: 'draft',
      }),
    );
    expect(errors.management).toBeTruthy();
  });

  it('refuses a phone that is not E.164 and a URL without a scheme', () => {
    const { errors } = parseEntityForm(
      def,
      form({
        nameOfficial: 'X',
        nameShort: 'X',
        management: 'publica',
        type: 'otro',
        status: 'draft',
        phoneE164: '021 123 456',
        website: 'una.py',
      }),
    );
    expect(errors.phoneE164).toBeTruthy();
    expect(errors.website).toBeTruthy();
  });

  it('never reads a read-only field, even when one is submitted', () => {
    const { values } = parseEntityForm(
      ENTITY_DEFS.ofertas,
      form({
        programId: '1',
        campusId: '2',
        modality: 'presencial',
        shift: 'manana',
        status: 'draft',
        // enrollment_status is derived by the daily cron. A forged field must
        // not become a column write.
        enrollmentStatus: 'abiertas',
      }),
    );
    expect(values.enrollmentStatus).toBeUndefined();
  });

  it('reads a checkbox as a boolean whether or not it is present', () => {
    const { values } = parseEntityForm(
      ENTITY_DEFS.sedes,
      form({
        institutionId: '1',
        name: 'Sede Central',
        cityId: '3',
        status: 'draft',
        isMain: 'on',
      }),
    );
    expect(values.isMain).toBe(true);
    const { values: unchecked } = parseEntityForm(
      ENTITY_DEFS.sedes,
      form({ institutionId: '1', name: 'Sede Central', cityId: '3', status: 'draft' }),
    );
    expect(unchecked.isMain).toBe(false);
  });
});

describe('deriveSystemFields', () => {
  it('derives a slug from the title when none was typed', () => {
    const values = deriveSystemFields(ENTITY_DEFS.instituciones, {
      nameOfficial: 'Universidad Católica "Ntra. Sra. de la Asunción"',
      slug: null,
    });
    expect(values.slug).toBe('universidad-catolica-ntra-sra-de-la-asuncion');
  });

  it('honours a typed slug', () => {
    const values = deriveSystemFields(ENTITY_DEFS.instituciones, {
      nameOfficial: 'Universidad Nacional de Asunción',
      slug: 'una',
    });
    expect(values.slug).toBe('una');
  });

  it('sets a match key on institutions and programs and nowhere else', () => {
    expect(
      deriveSystemFields(ENTITY_DEFS.instituciones, { nameOfficial: 'Universidad Nacional' })
        .matchKey,
    ).toBeTruthy();
    expect(
      deriveSystemFields(ENTITY_DEFS.programas, { nameOfficial: 'Carrera de Medicina' }).matchKey,
    ).toBeTruthy();
    expect(
      deriveSystemFields(ENTITY_DEFS.sedes, { name: 'Sede Central' }).matchKey,
    ).toBeUndefined();
  });

  it('keys a program with the career stopword list, not the institution one', () => {
    // "Carrera de" is a career stopword; if the institution list were used the
    // program would never match the rows the importer writes.
    const key = deriveSystemFields(ENTITY_DEFS.programas, {
      nameOfficial: 'Carrera de Medicina y Cirugía',
    }).matchKey;
    expect(key).not.toContain('carrera');
  });
});

describe('labelForValue', () => {
  it('renders an absent value as an em dash, never as a blank', () => {
    const field = ENTITY_DEFS.instituciones.fields.find((f) => f.name === 'website')!;
    expect(labelForValue(field, null)).toBe('—');
  });

  it('uses the Spanish enum label', () => {
    const field = ENTITY_DEFS.instituciones.fields.find((f) => f.name === 'management')!;
    expect(labelForValue(field, 'publica')).toBe('Pública');
  });
});
