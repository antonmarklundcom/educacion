/** The lead modal. Every string here ships to the browser — see `architecture.md` §30.2. */
export const leadCopy = {
  trigger: 'Solicitar info',
  heading: 'Solicitar información',
  sentHeading: 'Solicitud enviada',
  close: 'Cerrar',
  subtitle: (programName: string, institutionName: string) => `${programName} — ${institutionName}`,
  sentBody: (institutionName: string) =>
    `Enviamos tus datos a ${institutionName}. Ellos te van a contactar por el número que dejaste. No los compartimos con nadie más.`,
  fields: {
    name: 'Nombre y apellido',
    phone: 'Teléfono (WhatsApp)',
    phoneHint: 'Ejemplo: 0981 123 456',
    email: 'Email (opcional)',
    message: 'Mensaje (opcional)',
    age: 'Edad',
    /** The honeypot's label. Read by bots, hidden from people. */
    honeypot: 'Empresa',
  },
  submit: 'Enviar solicitud',
  submitting: 'Enviando…',
  /**
   * Three parts because the sentence contains a link. The catalog owns the
   * words on both sides of it, so a translator can move the link within the
   * sentence without touching JSX.
   */
  privacyNoteBefore: (institutionName: string) =>
    `Tus datos se envían únicamente a ${institutionName}. Podés pedir que los borremos escribiéndonos — ver `,
  privacyNoteLink: 'política de privacidad',
  privacyNoteAfter: '.',
} as const;
