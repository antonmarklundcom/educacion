import { describe, expect, it } from 'vitest';

import { leadsToCsv } from './leads-csv';
import type { PanelLeadExportRow } from '@/db/queries/panel/leads';

function row(overrides: Partial<PanelLeadExportRow> = {}): PanelLeadExportRow {
  return {
    id: 1,
    offeringId: 10,
    programName: 'Ingeniería',
    status: 'new',
    ageBracket: '18_mas',
    createdAt: new Date('2026-08-01T12:00:00Z'),
    deliveredAt: null,
    sourcePage: '/carreras/ingenieria',
    name: 'Ana Pérez',
    phoneE164: '+595981123456',
    email: 'ana@example.py',
    message: 'Hola',
    consentAt: new Date('2026-08-01T12:00:00Z'),
    ...overrides,
  };
}

describe('leadsToCsv', () => {
  it('renders a header and one line per lead', () => {
    const csv = leadsToCsv([row()]);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('id,fecha,estado,edad,carrera,nombre,telefono,email,mensaje,pagina');
    expect(lines[1]).toContain('Ana Pérez');
    expect(lines[1]).toContain('0981 123 456');
  });

  it('never exposes ip_hash or user_agent — they are not on the row type at all', () => {
    const csv = leadsToCsv([row()]);
    expect(csv).not.toMatch(/ip_hash|user_agent/i);
  });

  it('redacts contact fields as empty cells, not the word "null"', () => {
    const csv = leadsToCsv([row({ name: null, phoneE164: null, email: null, message: null })]);
    expect(csv).not.toMatch(/null/i);
    const [, dataLine] = csv.trim().split('\r\n');
    expect(dataLine.split(',').slice(5, 9)).toEqual(['', '', '', '']);
  });

  it('quotes a field containing a comma', () => {
    const csv = leadsToCsv([row({ message: 'Hola, ¿tenés cupos?' })]);
    expect(csv).toContain('"Hola, ¿tenés cupos?"');
  });
});
