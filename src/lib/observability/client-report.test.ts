/**
 * The browser→server error report (PR-45).
 *
 * `/api/client-error` is public and unauthenticated, so the contract *is* the
 * security boundary: five short strings, everything else dropped. These tests
 * are that contract, from both ends — what the boundary builds, and what the
 * route accepts.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_MESSAGE_LENGTH,
  MAX_STACK_LENGTH,
  parseClientReport,
  safePath,
  toClientReport,
} from './client-report';

describe('toClientReport', () => {
  it('takes the five fields and nothing else off the error', () => {
    // `AuthError` and `RaceLost` in this codebase both carry extra properties;
    // a report built by spreading the error would serialize them.
    const error = Object.assign(new Error('algo falló'), {
      digest: 'abc123',
      reason: 'forbidden',
      lead: { phone: '+595981123456' },
    });
    const report = toClientReport(error, '/carreras');
    expect(Object.keys(report).sort()).toEqual(['digest', 'message', 'name', 'path', 'stack']);
    expect(JSON.stringify(report)).not.toContain('981123456');
  });

  it('drops the query from the path before it leaves the browser', () => {
    const report = toClientReport(new Error('x'), '/carreras?q=medicina');
    expect(report.path).toBe('/carreras');
  });

  it('truncates a message and a stack', () => {
    const error = new Error('a'.repeat(5_000));
    error.stack = 'b'.repeat(50_000);
    const report = toClientReport(error, '/');
    expect(report.message).toHaveLength(MAX_MESSAGE_LENGTH);
    expect(report.stack).toHaveLength(MAX_STACK_LENGTH);
  });

  it('survives an error with an empty message', () => {
    const report = toClientReport(new Error(''), undefined);
    expect(report.message).toBe('(sin mensaje)');
    expect(report.name).toBe('Error');
  });
});

describe('safePath', () => {
  it('accepts an absolute same-origin path', () => {
    expect(safePath('/universidades/una')).toBe('/universidades/una');
  });

  it('refuses a protocol-relative url, which is another origin', () => {
    expect(safePath('//evil.example/x')).toBeUndefined();
  });

  it('refuses an absolute url', () => {
    expect(safePath('https://evil.example/x')).toBeUndefined();
  });

  it('refuses anything that is not a string', () => {
    for (const value of [null, undefined, 42, {}, ['/a']]) {
      expect(safePath(value)).toBeUndefined();
    }
  });
});

describe('parseClientReport', () => {
  const valid = { name: 'TypeError', message: 'x is not a function' };

  it('accepts the shape the boundary sends', () => {
    expect(parseClientReport(valid)).toMatchObject(valid);
  });

  it('narrows an event decorated with extra keys instead of rejecting it', () => {
    // A browser extension that decorates an error object should not silence
    // the report, and rejecting would make the endpoint an oracle for what it
    // accepts.
    const parsed = parseClientReport({
      ...valid,
      cookies: 'educacion_session=abc',
      formData: { phone: '+595981123456' },
      __proto__: { polluted: true },
    });
    expect(Object.keys(parsed ?? {}).sort()).toEqual([
      'digest',
      'message',
      'name',
      'path',
      'stack',
    ]);
    expect(JSON.stringify(parsed)).not.toContain('981123456');
    expect(JSON.stringify(parsed)).not.toContain('educacion_session');
  });

  it('refuses a body that says nothing', () => {
    // What a bot POSTing `{}` sends. A report with no message and no digest
    // tells the server nothing its own log did not already have.
    expect(parseClientReport({})).toBeNull();
    expect(parseClientReport({ name: 'Error' })).toBeNull();
    expect(parseClientReport(null)).toBeNull();
    expect(parseClientReport('boom')).toBeNull();
    expect(parseClientReport([1, 2, 3])).toBeNull();
  });

  it('accepts a digest with no message, which is what a server error gives', () => {
    expect(parseClientReport({ digest: 'abc123' })?.digest).toBe('abc123');
  });

  it('truncates every field, so the body cannot be a payload', () => {
    const parsed = parseClientReport({
      name: 'N'.repeat(10_000),
      message: 'M'.repeat(10_000),
      stack: 'S'.repeat(100_000),
      digest: 'D'.repeat(10_000),
      path: `/${'p'.repeat(10_000)}`,
    });
    expect(parsed!.name.length).toBeLessThanOrEqual(120);
    expect(parsed!.message.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(parsed!.stack!.length).toBeLessThanOrEqual(MAX_STACK_LENGTH);
    expect(parsed!.digest!.length).toBeLessThanOrEqual(64);
    expect(parsed!.path!.length).toBeLessThanOrEqual(256);
  });

  it('drops a non-string field rather than coercing it', () => {
    const parsed = parseClientReport({ message: 'real', stack: { toString: 'evil' }, path: 42 });
    expect(parsed?.stack).toBeUndefined();
    expect(parsed?.path).toBeUndefined();
  });

  it('drops a path pointing somewhere else', () => {
    expect(parseClientReport({ message: 'x', path: 'https://evil.example' })?.path).toBeUndefined();
  });
});
