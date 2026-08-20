'use client';

/**
 * The body of every segment error boundary (PR-42).
 *
 * A client component because Next.js requires error boundaries to be one —
 * `reset()` is a client callback (CLAUDE.md rule 6).
 *
 * One component behind four boundaries so the rule that matters is written
 * once: **nothing derived from the error reaches the page.** Not
 * `error.message`, which on a `force-dynamic` route against MySQL is routinely
 * a connection string or a failing SQL fragment; not `error.stack`, which is
 * file paths. Only `digest` — the opaque id Next.js also writes to the server
 * log — so an operator can match a screenshot to a log line without the page
 * carrying anything an attacker can read.
 *
 * PR-45 added the second half of that sentence: the error is not shown to the
 * *reader*, and it **is** sent to the operator. It goes to
 * `/api/client-error`, which hands it to the Node SDK — not to a browser SDK,
 * which measures ~144 kB gzipped in this project against a 150 kB page budget
 * (`src/lib/observability/client-report.ts`). The report is five short strings
 * built here, so nothing about the person on the page can travel with it.
 */

import { useEffect } from 'react';

import { Button } from '@/components/ui';
import { CLIENT_ERROR_ENDPOINT, toClientReport } from '@/lib/observability/client-report';

export interface ShellErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** What failed, in the reader's terms. Voseo, per CLAUDE.md rule 8. */
  title: string;
  description: string;
  /**
   * Only the root boundary sets this. The three shell layouts already render
   * their own `#contenido` wrapper, and the boundary renders *inside* it — a
   * second element with that id would be a duplicate DOM id, and the skip link
   * would still resolve to the outer one.
   */
  id?: string;
}

export function ShellError({ error, reset, title, description, id }: ShellErrorProps) {
  useEffect(() => {
    // Server-side this is already logged by Next.js; this is the browser half.
    console.error(error);

    // Fire and forget. `keepalive` so the report survives the reader closing
    // the tab on a page that has just broken, and the rejection is swallowed
    // because a failed report must never become a second error inside an error
    // boundary — that is how a boundary loops.
    void fetch(CLIENT_ERROR_ENDPOINT, {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        toClientReport(error, typeof window === 'undefined' ? undefined : window.location.pathname),
      ),
    }).catch(() => {});
  }, [error]);

  return (
    <main
      id={id}
      className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center"
    >
      <h1 className="text-ink text-2xl font-bold lg:text-3xl">{title}</h1>
      <p className="text-body">{description}</p>
      <Button variant="primary" onClick={reset}>
        Reintentar
      </Button>
      {error.digest && <p className="text-faint font-mono text-xs">Referencia: {error.digest}</p>}
    </main>
  );
}
