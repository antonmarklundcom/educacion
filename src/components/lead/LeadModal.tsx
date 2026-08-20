'use client';

/**
 * CLIENT COMPONENT — "Solicitar info", the button and the dialog behind it.
 *
 * Justification: a dialog that opens, moves focus to the first field, closes on
 * Escape and restores focus on the way out, plus a form that posts without
 * navigating away from the carrera the student is reading, are browser
 * behaviour. Nothing else on the page becomes a client component because of it
 * — this is a leaf that server-rendered cards and the detail page hero drop in.
 *
 * ### What it imports, and what it must not
 *
 * `@/lib/leads/contract` and `@/lib/leads/phone` only — both are pure. Importing
 * `@/lib/leads` would pull Drizzle and mysql2 into the browser bundle, which is
 * the failure `architecture.md` §5.1 documents for the search barrel and the
 * same rule applies here.
 *
 * ### The consent checkbox
 *
 * Unchecked by default, `required`, and its label names the institution that
 * will receive the data (`risks.md` §R-06). The version stamped on the lead is
 * `CONSENT_TEXT_VERSION`; if it has moved since this page was served the server
 * refuses the submission and the message asks for a reload, rather than
 * recording an agreement to a text nobody saw.
 *
 * ### Validation here is courtesy, not security
 *
 * The phone is parsed client-side so a student learns about a typo before
 * pressing send. The server re-parses it with the same pure function and is the
 * only authority (CLAUDE.md rule 4).
 */

import { useEffect, useId, useRef, useState } from 'react';

import {
  AGE_BRACKET_LABELS,
  CONSENT_TEXT_VERSION,
  HONEYPOT_FIELD,
  LEAD_ERROR_MESSAGES,
  LEAD_LIMITS,
  MINOR_NOTICE,
  consentText,
  type AgeBracket,
  type LeadErrorCode,
  type LeadResponse,
} from '@/lib/leads/contract';
import { parseParaguayanPhone } from '@/lib/leads/phone';
import { leadCopy } from '@/lib/copy/lead';

export interface LeadModalProps {
  offeringId: number;
  programName: string;
  /** Named in the consent text, so it is the official name, not the short one. */
  institutionName: string;
  /** `primary` is the accent CTA; `secondary` is the outline used on cards. */
  variant?: 'primary' | 'secondary';
  className?: string;
  label?: string;
}

type Status = 'idle' | 'sending' | 'sent';

const AGE_OPTIONS: AgeBracket[] = ['menor_18', '18_mas', 'no_declarado'];

const BUTTON_BASE =
  'inline-flex min-h-12 w-full items-center justify-center rounded-md px-5 text-sm font-medium transition-colors duration-200 ease-out focus-visible:ring-ink focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto';

export function LeadModal({
  offeringId,
  programName,
  institutionName,
  variant = 'primary',
  className,
  label = leadCopy.trigger,
}: LeadModalProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<LeadErrorCode | null>(null);
  const [phoneError, setPhoneError] = useState(false);
  const [ageBracket, setAgeBracket] = useState<AgeBracket>('no_declarado');

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const formId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const phone = String(data.get('phone') ?? '');
    if (!parseParaguayanPhone(phone).ok) {
      setPhoneError(true);
      setError('invalid_phone');
      return;
    }
    setPhoneError(false);
    setError(null);
    setStatus('sending');

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          offeringId,
          name: String(data.get('name') ?? ''),
          phone,
          email: String(data.get('email') ?? '') || undefined,
          message: String(data.get('message') ?? '') || undefined,
          ageBracket: String(data.get('ageBracket') ?? 'no_declarado'),
          consent: data.get('consent') === 'on',
          consentTextVersion: CONSENT_TEXT_VERSION,
          sourcePage: window.location.href,
          [HONEYPOT_FIELD]: String(data.get(HONEYPOT_FIELD) ?? ''),
        }),
      });

      const body = (await response.json().catch(() => null)) as LeadResponse | null;
      if (body?.ok) {
        setStatus('sent');
        return;
      }
      setError(body && !body.ok ? body.error : 'server_error');
      setStatus('idle');
    } catch {
      setError('server_error');
      setStatus('idle');
    }
  }

  const buttonClass = [
    BUTTON_BASE,
    variant === 'primary'
      ? 'bg-accent hover:bg-accent-hover text-white'
      : 'border-border-strong bg-surface text-ink hover:bg-card-alt border',
    className ?? '',
  ].join(' ');

  return (
    <>
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          {/* The backdrop closes the modal on click, which makes it
              interactive — so it is a real button with a label rather than a
              div with a mouse handler. Keyboard users get the same affordance
              for free, and Escape is already handled by the document listener
              above (PR-34). */}
          <button
            type="button"
            aria-label={leadCopy.close}
            tabIndex={-1}
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="bg-surface relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-lg p-6 sm:rounded-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id={titleId} className="text-ink text-lg font-semibold">
                {status === 'sent' ? leadCopy.sentHeading : leadCopy.heading}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink focus-visible:ring-ink rounded-sm p-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
                aria-label={leadCopy.close}
              >
                ✕
              </button>
            </div>

            {status === 'sent' ? (
              <div className="mt-4">
                <p className="text-body text-sm">{leadCopy.sentBody(institutionName)}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={`${BUTTON_BASE} border-border-strong bg-surface text-ink hover:bg-card-alt mt-5 border`}
                >
                  {leadCopy.close}
                </button>
              </div>
            ) : (
              <form id={formId} onSubmit={onSubmit} className="mt-4 flex flex-col gap-4" noValidate>
                <p className="text-muted text-sm">
                  {leadCopy.subtitle(programName, institutionName)}
                </p>

                <Field label={leadCopy.fields.name} htmlFor={`${formId}-name`} required>
                  <input
                    ref={firstFieldRef}
                    id={`${formId}-name`}
                    name="name"
                    required
                    minLength={LEAD_LIMITS.nameMin}
                    maxLength={LEAD_LIMITS.nameMax}
                    autoComplete="name"
                    className={INPUT_CLASS}
                  />
                </Field>

                <Field
                  label={leadCopy.fields.phone}
                  htmlFor={`${formId}-phone`}
                  required
                  hint={leadCopy.fields.phoneHint}
                  invalid={phoneError}
                >
                  <input
                    id={`${formId}-phone`}
                    name="phone"
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    className={INPUT_CLASS}
                    onChange={() => phoneError && setPhoneError(false)}
                  />
                </Field>

                <Field label={leadCopy.fields.email} htmlFor={`${formId}-email`}>
                  <input
                    id={`${formId}-email`}
                    name="email"
                    type="email"
                    maxLength={LEAD_LIMITS.emailMax}
                    autoComplete="email"
                    className={INPUT_CLASS}
                  />
                </Field>

                <Field label={leadCopy.fields.message} htmlFor={`${formId}-message`}>
                  <textarea
                    id={`${formId}-message`}
                    name="message"
                    rows={3}
                    maxLength={LEAD_LIMITS.messageMax}
                    className={INPUT_CLASS}
                  />
                </Field>

                <Field label={leadCopy.fields.age} htmlFor={`${formId}-age`}>
                  <select
                    id={`${formId}-age`}
                    name="ageBracket"
                    value={ageBracket}
                    onChange={(event) => setAgeBracket(event.target.value as AgeBracket)}
                    className={INPUT_CLASS}
                  >
                    {AGE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {AGE_BRACKET_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </Field>

                {/* Honeypot. Hidden from people, not from form-filling bots. */}
                <div aria-hidden className="absolute h-px w-px overflow-hidden opacity-0">
                  <label htmlFor={`${formId}-${HONEYPOT_FIELD}`}>{leadCopy.fields.honeypot}</label>
                  <input
                    id={`${formId}-${HONEYPOT_FIELD}`}
                    name={HONEYPOT_FIELD}
                    tabIndex={-1}
                    autoComplete="off"
                    defaultValue=""
                  />
                </div>

                <label className="text-body flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    name="consent"
                    required
                    defaultChecked={false}
                    className="accent-ink mt-0.5 size-4 shrink-0"
                  />
                  <span>
                    {consentText(institutionName)}
                    {ageBracket === 'menor_18' && (
                      <span className="text-muted mt-1 block">{MINOR_NOTICE}</span>
                    )}
                  </span>
                </label>

                {error && (
                  <p role="alert" className="text-danger text-sm">
                    {LEAD_ERROR_MESSAGES[error]}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className={`${BUTTON_BASE} bg-accent hover:bg-accent-hover text-white disabled:pointer-events-none disabled:opacity-50`}
                >
                  {status === 'sending' ? leadCopy.submitting : leadCopy.submit}
                </button>

                <p className="text-faint text-xs">
                  {leadCopy.privacyNoteBefore(institutionName)}
                  <a href="/legal/privacidad" className="underline underline-offset-2">
                    {leadCopy.privacyNoteLink}
                  </a>
                  {leadCopy.privacyNoteAfter}
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const INPUT_CLASS =
  'border-border-strong bg-surface text-ink placeholder:text-faint focus-visible:ring-ink w-full rounded-md border px-3 py-2.5 text-sm focus-visible:ring-2 focus-visible:outline-none';

function Field({
  label,
  htmlFor,
  required,
  hint,
  invalid,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-body text-sm font-medium">
        {label}
        {required && <span className="text-muted"> *</span>}
      </label>
      {children}
      {hint && <p className={invalid ? 'text-danger text-xs' : 'text-faint text-xs'}>{hint}</p>}
    </div>
  );
}
