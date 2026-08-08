/**
 * The one place that sends mail.
 *
 * PR-14 established the approach and the reasoning, and both still hold:
 * Resend is one HTTP `POST`, its SDK is a thin wrapper over that `POST`, and
 * `architecture.md` §1's "deliberately excluded" list exists to stop the
 * unexamined dependency. So this is `fetch`.
 *
 * What changed is that there is now more than one thing to send. Two copies of
 * the same Resend client in one codebase is how one of them quietly gains a
 * retry, a timeout or a `reply_to` policy that the other never gets — so the
 * `POST` lives here and the callers describe messages.
 *
 * **Nothing here throws.** Every caller is either in a request path that must
 * not fail because mail failed (a lead is already committed) or in one where
 * throwing would leak whether an address exists (password reset). The return
 * value says whether it was accepted; the caller decides whether that matters.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  /** Prefixes the log line, so a failure says which feature it belonged to. */
  context?: string;
}

/** `true` when Resend accepted the message. Never throws. */
export async function sendEmail(message: OutboundEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;
  const tag = message.context ?? 'email';

  if (!apiKey || !from) {
    console.warn(
      `[${tag}] not sent: RESEND_API_KEY or LEAD_FROM_EMAIL is unset (docs/deployment.md §6).`,
    );
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [message.to],
        reply_to: message.replyTo,
        subject: message.subject,
        text: message.text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[${tag}] delivery failed: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[${tag}] delivery threw`, error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
