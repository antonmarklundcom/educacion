import { describe, expect, it } from 'vitest';

import {
  parseCampusInput,
  parseCareerInput,
  parseInstitutionInput,
  parseOfferingInput,
  parseProgramInput,
} from './validation';

function fd(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe('parseInstitutionInput', () => {
  const base = {
    nameOfficial: 'Universidad Nacional de Asunción',
    nameShort: 'UNA',
    management: 'publica',
    type: 'universidad',
    status: 'draft',
  };

  it('accepts a complete, valid submission', () => {
    const result = parseInstitutionInput(fd(base));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.management).toBe('publica');
      expect(result.data.nameShort).toBe('UNA');
    }
  });

  // CLAUDE.md rule 1: no default management. A blank submission must fail,
  // never quietly become 'privada'.
  it('rejects a blank management rather than defaulting to privada', () => {
    const result = parseInstitutionInput(fd({ ...base, management: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.management).toBeDefined();
  });

  it('rejects an invalid slug', () => {
    const result = parseInstitutionInput(fd({ ...base, slug: 'Universidad Católica' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.slug).toBeDefined();
  });

  it('accepts a well-formed slug', () => {
    const result = parseInstitutionInput(fd({ ...base, slug: 'universidad-catolica' }));
    expect(result.ok).toBe(true);
  });

  it('rejects a phone that is not Paraguayan', () => {
    const result = parseInstitutionInput(fd({ ...base, phoneE164: '12345' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.phoneE164).toBeDefined();
  });

  it('normalizes a valid national-format phone to E.164', () => {
    const result = parseInstitutionInput(fd({ ...base, whatsappE164: '0981123456' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.whatsappE164).toBe('+595981123456');
  });

  it('rejects a malformed brand color', () => {
    const result = parseInstitutionInput(fd({ ...base, brandColor: 'teal' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.brandColor).toBeDefined();
  });

  it('requires the official name', () => {
    const result = parseInstitutionInput(fd({ ...base, nameOfficial: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.nameOfficial).toBeDefined();
  });
});

describe('parseCampusInput', () => {
  it('requires institutionId and cityId as positive integers', () => {
    const result = parseCampusInput(
      fd({ institutionId: '0', name: 'Sede Central', cityId: '', status: 'published' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.institutionId).toBeDefined();
      expect(result.errors.cityId).toBeDefined();
    }
  });

  it('accepts a valid campus and reads the isMain checkbox', () => {
    const data = fd({
      institutionId: '1',
      name: 'Sede Central',
      cityId: '2',
      status: 'published',
      isMain: 'on',
    });
    const result = parseCampusInput(data);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.isMain).toBe(true);
  });

  it('defaults isMain to false when the checkbox is absent', () => {
    const result = parseCampusInput(
      fd({ institutionId: '1', name: 'Sede Central', cityId: '2', status: 'published' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.isMain).toBe(false);
  });
});

describe('parseCareerInput', () => {
  it('splits comma-separated synonyms and trims them', () => {
    const result = parseCareerInput(
      fd({
        nameEs: 'Medicina',
        levelDefault: 'grado',
        status: 'draft',
        synonyms: 'Medicina y Cirugía,  Doctor en Medicina ,',
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.synonyms).toEqual(['Medicina y Cirugía', 'Doctor en Medicina']);
    }
  });

  it('never fabricates salida_laboral_md — a blank field stays null', () => {
    const result = parseCareerInput(
      fd({ nameEs: 'Medicina', levelDefault: 'grado', status: 'draft' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.salidaLaboralMd).toBeNull();
  });
});

describe('parseProgramInput', () => {
  it('requires institutionId and level', () => {
    const result = parseProgramInput(
      fd({ institutionId: '', nameOfficial: 'Medicina y Cirugía', level: '', status: 'draft' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.institutionId).toBeDefined();
      expect(result.errors.level).toBeDefined();
    }
  });
});

describe('parseOfferingInput', () => {
  it('rejects a non-positive duration', () => {
    const result = parseOfferingInput(
      fd({
        programId: '1',
        campusId: '1',
        modality: 'presencial',
        shift: 'manana',
        status: 'draft',
        durationMonths: '-3',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.durationMonths).toBeDefined();
  });

  it('accepts a minimal valid offering with no duration given', () => {
    const result = parseOfferingInput(
      fd({ programId: '1', campusId: '1', modality: 'presencial', shift: 'manana', status: 'draft' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.durationMonths).toBeNull();
  });

  it('rejects a malformed plan URL', () => {
    const result = parseOfferingInput(
      fd({
        programId: '1',
        campusId: '1',
        modality: 'presencial',
        shift: 'manana',
        status: 'draft',
        planUrl: 'not-a-url',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.planUrl).toBeDefined();
  });
});
