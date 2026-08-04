/**
 * The institution's own contact details, exactly as the register has them.
 *
 * Every line is conditional. A missing website is not rendered as a dash and
 * certainly not guessed from the slug — plenty of Paraguayan institutions have
 * no site, and a fabricated URL would be a broken promise on a page that is
 * meant to be the reliable one. When we have nothing at all, the block says so.
 *
 * The WhatsApp link is the institution's own published number. Per-program
 * prefill and `whatsapp_click` event logging belong to PR-14/PR-17.
 */

import { Card } from '@/components/ui';
import type { InstitutionProfile } from '@/lib/institutions';

export function ContactBlock({ institution }: { institution: InstitutionProfile }) {
  const { website, email, phoneE164, whatsappE164 } = institution;
  const hasAny = Boolean(website || email || phoneE164 || whatsappE164);

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-ink text-base font-semibold">Contacto</h2>

      {hasAny ? (
        <dl className="flex flex-col gap-2 text-sm">
          {website && (
            <Row term="Sitio web">
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-body hover:text-ink break-all underline underline-offset-2"
              >
                {website.replace(/^https?:\/\//, '')} ↗
              </a>
            </Row>
          )}
          {email && (
            <Row term="Email">
              <a
                href={`mailto:${email}`}
                className="text-body hover:text-ink break-all underline underline-offset-2"
              >
                {email}
              </a>
            </Row>
          )}
          {phoneE164 && (
            <Row term="Teléfono">
              <a href={`tel:${phoneE164}`} className="text-ink font-mono">
                {phoneE164}
              </a>
            </Row>
          )}
          {whatsappE164 && (
            <Row term="WhatsApp">
              <a
                href={`https://wa.me/${whatsappE164.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink font-mono underline underline-offset-2"
              >
                {whatsappE164}
              </a>
            </Row>
          )}
        </dl>
      ) : (
        <p className="text-muted text-sm">
          Todavía no verificamos los datos de contacto de esta institución.
        </p>
      )}

      <p className="text-faint border-border border-t pt-2 text-xs">
        ¿Sos de esta institución y ves un dato incorrecto? Escribinos y lo corregimos.
      </p>
    </Card>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-faint text-xs">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
