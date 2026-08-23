/**
 * The public auth forms' input, as zod schemas (PR-51).
 *
 * ### Why these four and not the admin forms
 *
 * `pr-plan.md` PR-51: zod goes on the **public-facing** surfaces — the ones an
 * unauthenticated stranger can post to — where hand-rolled parsing risk is
 * highest and where a missed check is a security finding rather than a bad row.
 * `src/lib/admin/validation.ts` keeps the admin and panel forms until a real
 * defect says otherwise; one PR does not rewrite working validation for
 * symmetry.
 *
 * ### What a schema decides here, and what it must not
 *
 * These parse `FormData` into named fields with lengths and shapes. They do not
 * decide **outcomes**, and three in particular stay outside:
 *
 * - **Sign-in never reports why.** `login.ts` answers one message for every
 *   failure, unknown address included, and this schema cannot be allowed to
 *   split that: a "correo inválido" for a malformed address and a generic
 *   refusal for a real one is an account oracle with extra steps. So
 *   `loginSchema` refuses only what could not be a credential at all — an
 *   absent field, or a string longer than anything we would hash — and every
 *   other outcome goes through `authenticate`.
 * - **Password reset answers the same sentence for every address**, so the
 *   schema's job is the same: reject what cannot be an address, and let the
 *   neutral answer cover the rest.
 * - **Password strength is `passwordProblem`'s**, not a `.min()` here. It owns
 *   the two numbers and the Spanish that names them, and the reset form, the
 *   change-password form and the bootstrap script must all get the same answer.
 *
 * Messages are Paraguayan and user-facing: unlike `leads/schema.ts`, whose
 * caller answers machine codes, these are read straight into a form.
 *
 * ### Server-side only
 *
 * The forms these back are client components, and `zod` on a public route is
 * bundle weight the 150 kB budget (`architecture.md` §9) does not have spare.
 * So the browser keeps what it already had — `required`, `minLength`,
 * `maxLength` and `type` attributes driven by the **same constants** these
 * schemas read — and the schema is the server's single statement of the same
 * shape. `client-bundle.test.ts` holds that boundary: this module reaching a
 * `'use client'` file is a red test, not a review comment.
 */

import { z } from 'zod';

import { MAX_PASSWORD_LENGTH } from './password';

/**
 * Long enough for any real address, short enough to bound an allocation on an
 * unauthenticated endpoint. `users.email` is `varchar(255)`.
 */
export const EMAIL_MAX = 255;

/**
 * A bound, not a policy, and `password.ts`'s bound rather than a second one:
 * `passwordProblem` decides whether a password is *acceptable*, and
 * `hashPassword` refuses anything longer than this outright. Restating the
 * number here is how the form and the hasher end up disagreeing about which
 * passphrase is too long.
 */
export const PASSWORD_FIELD_MAX = MAX_PASSWORD_LENGTH;

/** `FormData.get` → a trimmed string, or '' for anything that is not one. */
const formString = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value.trim() : ''));

/** Same, untrimmed: a password's leading and trailing spaces are the user's. */
const formSecret = z.unknown().transform((value) => (typeof value === 'string' ? value : ''));

const email = formString.pipe(
  z.string().min(1, 'Escribí tu correo.').max(EMAIL_MAX, 'Ese correo es demasiado largo.'),
);

/** Deliberately permissive — see `leads/schema.ts`, same reasoning. */
const plausibleEmail = formString.pipe(
  z
    .string()
    .max(EMAIL_MAX, 'Ese correo es demasiado largo.')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Escribí un correo válido.'),
);

const secret = formSecret.pipe(
  z
    .string()
    .min(1, 'Escribí tu contraseña.')
    .max(PASSWORD_FIELD_MAX, 'Esa contraseña es demasiado larga.'),
);

/** `/ingresar`. Shape only — the outcome is `authenticate`'s. */
export const loginSchema = z.object({ email, password: secret });

/** `/recuperar-contrasena`. */
export const resetRequestSchema = z.object({ email: plausibleEmail });

/**
 * `/recuperar-contrasena/[token]` and `/cambiar-contrasena` share the "twice,
 * and they must match" shape. Strength is checked afterwards, by
 * `passwordProblem`.
 */
export const newPasswordSchema = z
  .object({ password: secret, confirmation: secret })
  .refine((value) => value.password === value.confirmation, {
    message: 'Las dos contraseñas no coinciden.',
    path: ['confirmation'],
  });

/** `/cambiar-contrasena` — the same, plus the current password. */
export const changePasswordSchema = z
  .object({ current: secret, password: secret, confirm: secret })
  .refine((value) => value.password === value.confirm, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirm'],
  });

/** The public "¿Es tu institución?" form. */
export const claimRequestSchema = z.object({
  email: plausibleEmail,
  contactName: formString
    .pipe(z.string().max(160, 'Ese nombre es demasiado largo.').optional())
    .transform((value) => value || null),
  note: formString
    .pipe(z.string().max(500, 'Ese mensaje es demasiado largo.').optional())
    .transform((value) => value || null),
});

/**
 * The first message a failed parse produced, for a form that shows one line.
 *
 * `undefined` when it parsed. Callers that need per-field errors read
 * `error.issues` themselves; nothing on these five forms does today.
 */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Revisá los datos.';
}

/** `safeParse` a `FormData` as a plain object of its string entries. */
export function parseForm<T extends z.ZodTypeAny>(
  schema: T,
  formData: FormData,
): z.SafeParseReturnType<unknown, z.infer<T>> {
  return schema.safeParse(Object.fromEntries(formData.entries()));
}
