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
 */

import { useEffect } from 'react';

import { Button } from '@/components/ui';

export interface ShellErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** What failed, in the reader's terms. Voseo, per CLAUDE.md rule 8. */
  title: string;
  description: string;
}

export function ShellError({ error, reset, title, description }: ShellErrorProps) {
  useEffect(() => {
    // Server-side this is already logged by Next.js; this is the browser half.
    console.error(error);
  }, [error]);

  return (
    <main
      id="contenido"
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
