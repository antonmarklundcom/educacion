/**
 * "Events carry no PII" — PR-45's acceptance criterion, tested against events
 * shaped like the ones this site would actually produce.
 *
 * Each case names the real request it is modelled on, because the point is not
 * that `scrubEvent` deletes a key called `cookies`; it is that **the lead form,
 * the login form and the R-06 deletion tool cannot reach Sentry**, and those
 * are the three requests on this site whose bodies are somebody's data.
 */

import { describe, expect, it } from 'vitest';

import {
  ALLOWED_EVENT_KEYS,
  redactSecrets,
  scrubEvent,
  scrubUrl,
  type ScrubbableEvent,
} from './scrub';

/** Every string in the event that must not survive. */
const SECRETS = [
  '+595981123456',
  'ana@example.com',
  'Ana Rectora',
  'educacion_session=Fe26.2**abc',
  'Bearer sk_live_123',
  '190.128.1.7',
  'medicina en asunción',
  'super-secret-cron',
];

/** A Server Action POST of the lead form, as Sentry would capture it. */
function leadFormEvent(): ScrubbableEvent {
  return {
    request: {
      url: 'https://educacion.com.py/universidades/una/medicina?q=medicina%20en%20asunci%C3%B3n',
      method: 'POST',
      headers: {
        cookie: 'educacion_session=Fe26.2**abc',
        authorization: 'Bearer sk_live_123',
        'x-forwarded-for': '190.128.1.7',
        'x-cron-secret': 'super-secret-cron',
        'user-agent': 'Mozilla/5.0',
      },
      cookies: { educacion_session: 'Fe26.2**abc' },
      data: { name: 'Ana Rectora', phone: '+595981123456', email: 'ana@example.com' },
      query_string: 'q=medicina en asunción',
      env: { REMOTE_ADDR: '190.128.1.7' },
    },
    user: { id: '42', email: 'ana@example.com', ip_address: '190.128.1.7' },
    extra: { formData: { phone: '+595981123456' } },
    contexts: {
      user: { email: 'ana@example.com' },
      response: { body: 'Ana Rectora' },
      runtime: { name: 'node', version: '22' },
    },
    breadcrumbs: [
      {
        category: 'fetch',
        message: 'POST /api/leads?telefono=+595981123456',
        data: { body: '{"phone":"+595981123456"}' },
      },
    ],
    // The field the first version of the scrubber never looked at. A mysql2
    // duplicate-key error names the value that collided, and on this site that
    // value is somebody's address.
    exception: {
      values: [
        {
          type: 'Error',
          value: "Duplicate entry 'ana@example.com' for key 'leads.email'",
        },
      ],
    },
    message: 'lead +595981123456 rechazado',
    // Set unconditionally by the SDK from `os.hostname()`, and NOT covered by
    // `sendDefaultPii: false`.
    server_name: 'srv1234.hstgr.io',
    modules: { mysql2: '3.23.2' },
    threads: { values: [{ id: 1 }] },
    attachments: [{ filename: 'lead.json', data: '+595981123456' }],
  } as ScrubbableEvent;
}

describe('scrubEvent', () => {
  it('lets nothing a person typed out of the process', () => {
    const serialized = JSON.stringify(scrubEvent(leadFormEvent()));
    for (const secret of SECRETS) {
      expect(serialized, `"${secret}" survived the scrubber`).not.toContain(secret);
    }
  });

  it('keeps the route, which is the whole point of the report', () => {
    const scrubbed = scrubEvent(leadFormEvent());
    expect(scrubbed.request?.url).toContain('/universidades/una/medicina');
    expect(scrubbed.request?.method).toBe('POST');
  });

  it('drops every request field except the url and the method', () => {
    const scrubbed = scrubEvent(leadFormEvent());
    expect(Object.keys(scrubbed.request ?? {}).sort()).toEqual(['method', 'url']);
  });

  it('drops user, extra, contexts.user and contexts.response', () => {
    const scrubbed = scrubEvent(leadFormEvent());
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.extra).toBeUndefined();
    expect(scrubbed.contexts?.user).toBeUndefined();
    expect(scrubbed.contexts?.response).toBeUndefined();
  });

  it('drops every top-level key it does not name', () => {
    // The property that survives the SDK gaining a field. `server_name` is the
    // host name; `attachments` can be anything at all.
    const scrubbed = scrubEvent(leadFormEvent());
    for (const key of Object.keys(scrubbed)) {
      expect(ALLOWED_EVENT_KEYS, `${key} should not have survived`).toContain(key);
    }
    const raw = scrubbed as Record<string, unknown>;
    expect(raw.server_name).toBeUndefined();
    expect(raw.modules).toBeUndefined();
    expect(raw.threads).toBeUndefined();
    expect(raw.attachments).toBeUndefined();
  });

  it('redacts the exception message rather than deleting it', () => {
    // An error with its message removed is not worth sending; an error that
    // quotes a student's address is not allowed to be sent. Both at once.
    const scrubbed = scrubEvent(leadFormEvent());
    const value = scrubbed.exception?.values?.[0].value ?? '';
    expect(value).not.toContain('ana@example.com');
    expect(value, 'the sentence still says what went wrong').toContain('Duplicate entry');
    expect(value).toContain("for key 'leads.email'");
  });

  it('redacts event.message too', () => {
    expect(scrubEvent(leadFormEvent()).message).not.toContain('981123456');
  });

  it('keeps debug_meta, which is what makes a stack readable', () => {
    // The ids that map a frame to an uploaded sourcemap. Dropping it would
    // quietly cost the readable stacks this PR exists to get.
    const scrubbed = scrubEvent({
      ...leadFormEvent(),
      debug_meta: { images: [{ debug_id: 'abc' }] },
    } as ScrubbableEvent);
    expect((scrubbed as Record<string, unknown>).debug_meta).toEqual({
      images: [{ debug_id: 'abc' }],
    });
  });

  it('keeps the contexts that describe the machine, not the person', () => {
    const scrubbed = scrubEvent(leadFormEvent());
    expect(scrubbed.contexts?.runtime).toEqual({ name: 'node', version: '22' });
  });

  it('drops breadcrumb data and the query in a breadcrumb message', () => {
    const scrubbed = scrubEvent(leadFormEvent());
    expect(scrubbed.breadcrumbs?.[0].data).toBeUndefined();
    expect(scrubbed.breadcrumbs?.[0].message).not.toContain('+595981123456');
    expect(scrubbed.breadcrumbs?.[0].category, 'the trail stays readable').toBe('fetch');
  });

  it('does not mutate the event it was given', () => {
    const event = leadFormEvent();
    scrubEvent(event);
    expect(event.request?.data).toEqual({
      name: 'Ana Rectora',
      phone: '+595981123456',
      email: 'ana@example.com',
    });
    expect(event.user).toBeDefined();
  });

  it('keeps the envelope that makes the report useful', () => {
    const scrubbed = scrubEvent({
      exception: { values: [{ type: 'TypeError', value: 'x is not a function' }] },
      release: 'abc123',
      environment: 'production',
      transaction: '/carreras',
      tags: { origin: 'client' },
      level: 'error',
    } as ScrubbableEvent);
    const raw = scrubbed as Record<string, unknown>;
    expect(raw.release).toBe('abc123');
    expect(raw.environment).toBe('production');
    expect(raw.transaction).toBe('/carreras');
    expect(raw.tags).toEqual({ origin: 'client' });
    expect(raw.level).toBe('error');
    expect(scrubbed.exception?.values?.[0].value).toBe('x is not a function');
  });

  it('survives an event with nothing on it', () => {
    expect(scrubEvent({})).toEqual({});
  });

  it('leaves an event with no request alone', () => {
    const scrubbed: ScrubbableEvent = scrubEvent({ contexts: { runtime: { name: 'node' } } });
    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.contexts).toEqual({ runtime: { name: 'node' } });
  });

  it('scrubs the R-06 lookup, which is the worst body on the site', () => {
    // `/admin/privacidad` posts the phone number of somebody who has just asked
    // us to hold less of their data. It must not land in a SaaS dashboard on
    // the way to honouring that request.
    const scrubbed = scrubEvent({
      request: {
        url: 'https://educacion.com.py/admin/privacidad',
        method: 'POST',
        data: { phone: '+595981123456', confirm: 'on' },
      },
    });
    expect(JSON.stringify(scrubbed)).not.toContain('981123456');
  });
});

describe('scrubUrl', () => {
  it('keeps the path and replaces the query', () => {
    expect(scrubUrl('https://educacion.com.py/carreras?q=derecho&ciudad=asuncion')).toBe(
      'https://educacion.com.py/carreras?[filtrado]',
    );
  });

  it('replaces a fragment too', () => {
    expect(scrubUrl('/carreras#ana@example.com')).toBe('/carreras?[filtrado]');
  });

  it('leaves a clean url alone', () => {
    expect(scrubUrl('https://educacion.com.py/carreras')).toBe('https://educacion.com.py/carreras');
  });

  it('passes undefined through', () => {
    expect(scrubUrl(undefined)).toBeUndefined();
  });
});

describe('redactSecrets', () => {
  it('removes an address and keeps the sentence', () => {
    expect(redactSecrets("Duplicate entry 'ana@example.com' for key 'leads.email'")).toBe(
      "Duplicate entry '[correo]' for key 'leads.email'",
    );
  });

  it('removes a phone however it was written', () => {
    for (const phone of ['+595981123456', '0981 123 456', '(021) 123-4567', '595981123456']) {
      expect(redactSecrets(`llamar a ${phone} ahora`), phone).not.toContain('123');
    }
  });

  it('leaves a short number alone, because a row id is not a person', () => {
    // The asymmetry is deliberate: a false positive costs a `[filtrado]`, a
    // false negative is an address in a third-party dashboard.
    expect(redactSecrets('offering 4821 not found')).toBe('offering 4821 not found');
  });

  it('passes undefined through', () => {
    expect(redactSecrets(undefined)).toBeUndefined();
  });
});
