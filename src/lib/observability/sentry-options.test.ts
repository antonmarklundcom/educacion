/**
 * The `beforeSend` the SDK is actually given (PR-45).
 *
 * `scrub.test.ts` proves the scrubber and `throttle.test.ts` proves the
 * throttle; this file proves they are **wired in**, which is the part a test of
 * either helper cannot see. Every case calls the options object
 * `sentry.server.config.ts` passes to `Sentry.init`.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { ScrubbableEvent } from './scrub';
import { environment, sentryInitOptions, serverDsn } from './sentry-options';
import { EventThrottle, type ThrottleableEvent } from './throttle';

const T0 = 1_000_000;

function options(now = () => T0) {
  // A throttle of its own per test: the module keeps a process-wide one on
  // purpose, and sharing it here would make these tests order-dependent.
  return sentryInitOptions('https://k@o0.ingest.sentry.io/1', {
    now,
    throttle: new EventThrottle(),
  });
}

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

describe('serverDsn', () => {
  it('is undefined when unset — the inert case CI and local dev run in', () => {
    delete process.env.SENTRY_DSN;
    expect(serverDsn()).toBeUndefined();
  });

  it('treats a blank or whitespace value as unset', () => {
    // hPanel's env editor happily stores an empty string, and an empty DSN
    // would make `Sentry.init` throw at boot rather than stay quiet.
    process.env.SENTRY_DSN = '   ';
    expect(serverDsn()).toBeUndefined();
    process.env.SENTRY_DSN = '';
    expect(serverDsn()).toBeUndefined();
  });

  it('trims a value that was pasted with a newline', () => {
    process.env.SENTRY_DSN = ' https://k@o0.ingest.sentry.io/1\n';
    expect(serverDsn()).toBe('https://k@o0.ingest.sentry.io/1');
  });
});

describe('environment', () => {
  it('prefers the explicit variable', () => {
    process.env.SENTRY_ENVIRONMENT = 'staging';
    expect(environment()).toBe('staging');
  });

  it('falls back to NODE_ENV rather than assuming production', () => {
    delete process.env.SENTRY_ENVIRONMENT;
    expect(environment()).toBe(process.env.NODE_ENV);
  });
});

describe('the options handed to Sentry.init', () => {
  it('turns tracing off and PII off explicitly', () => {
    const opts = options();
    expect(opts.tracesSampleRate).toBe(0);
    expect(opts.sendDefaultPii).toBe(false);
  });

  it('scrubs through beforeSend, not only in the helper', () => {
    const sent = options().beforeSend({
      request: {
        url: '/carreras?q=derecho',
        method: 'POST',
        headers: { cookie: 'educacion_session=abc' },
        data: { phone: '+595981123456' },
      },
      user: { ip_address: '190.128.1.7' },
    });
    const serialized = JSON.stringify(sent);
    expect(serialized).not.toContain('981123456');
    expect(serialized).not.toContain('educacion_session');
    expect(serialized).not.toContain('190.128.1.7');
    expect(serialized).not.toContain('q=derecho');
  });

  it('throttles a loop through beforeSend', () => {
    const opts = options();
    const event = () => ({
      exception: {
        values: [{ type: 'Error', stacktrace: { frames: [{ filename: 'a.ts', lineno: 1 }] } }],
      },
    });
    const results = Array.from({ length: 30 }, () => opts.beforeSend(event()));
    expect(results.filter((r) => r !== null)).toHaveLength(5);
    expect(results.filter((r) => r === null)).toHaveLength(25);
  });

  it('tags the announcement so the dashboard shows the loop, not five events', () => {
    const opts = options();
    const event = (): ScrubbableEvent & ThrottleableEvent => ({
      exception: {
        values: [{ type: 'Error', stacktrace: { frames: [{ filename: 'a.ts', lineno: 1 }] } }],
      },
    });
    const results = Array.from({ length: 10 }, () => opts.beforeSend(event()));
    const tagged = results.filter((r) => r?.tags?.throttled === 'true');
    expect(tagged).toHaveLength(1);
    expect(tagged[0]?.tags?.throttled_count).toBe('5');
  });

  it('does not tag the events it lets through normally', () => {
    const opts = options();
    const first = opts.beforeSend({ message: 'una vez' } as ScrubbableEvent & ThrottleableEvent);
    expect(first?.tags?.throttled).toBeUndefined();
  });

  it('strips breadcrumb data through beforeBreadcrumb', () => {
    const crumb = options().beforeBreadcrumb({
      category: 'ui.click',
      message: 'button',
      data: { value: '+595981123456' },
    });
    expect(crumb?.data).toBeUndefined();
    expect(crumb?.category).toBe('ui.click');
  });

  it('passes a null breadcrumb through rather than throwing on it', () => {
    expect(options().beforeBreadcrumb(null)).toBeNull();
  });
});
