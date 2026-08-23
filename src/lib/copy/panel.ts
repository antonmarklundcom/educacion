/**
 * `/panel` copy — the lead SLA nudge and the plan-status banner (PR-49).
 *
 * Server-only: every surface that reads it is a server component, and
 * `client-bundle.test.ts` holds that line so these strings never join a public
 * route's bundle the way the whole catalog once did.
 *
 * ### Two rules this copy exists to keep
 *
 * **The nudge names the fact, not a penalty.** "Hay 3 solicitudes sin
 * responder desde hace más de 48 horas" is something the institution can act
 * on; "incumpliste el SLA" is a word from a contract nobody signed. Nothing
 * here escalates, expires or threatens.
 *
 * **The free tier is stated, never counted down.** `pr-plan.md` PR-49: a free
 * institution sees its tier plainly and a link to the plans — no "te quedan N
 * días", no fake trial clock, nothing that reads as a countdown on a plan that
 * has no end date. The only dates in this file belong to periods an
 * institution actually bought.
 */

export const panelCopy = {
  leadSla: {
    /** The badge on an overdue row in the inbox. */
    badge: 'Sin responder',
    /**
     * Beside the badge: how long it has actually been waiting. Always plural —
     * a lead is only ever flagged at 48 h or more, which is two days or more,
     * so a singular form here would be a branch nothing can reach.
     */
    waitingDays: (days: number) => `hace ${days} días`,
    bannerHeading: 'Solicitudes esperando hace más de 48 horas',
    bannerOne: 'Hay 1 solicitud sin responder desde hace más de 48 horas.',
    bannerMany: (count: number) =>
      `Hay ${count} solicitudes sin responder desde hace más de 48 horas.`,
    bannerBody:
      'Quien la mandó está eligiendo carrera ahora. Abrila, escribile y marcala como contactada.',
    bannerAction: 'Ver las que están esperando',
    /** The dashboard stat's sub-label when some are overdue. */
    dashboardDetail: (count: number) => `${count} esperan hace más de 48 horas.`,
    dashboardDetailOne: '1 espera hace más de 48 horas.',
  },
  plan: {
    heading: (planName: string) => `Tu plan: ${planName}`,
    freeName: 'Gratis',
    dataAlwaysFree:
      'Cargar y corregir tus datos —aranceles, convocatorias, descripciones— es gratis y siempre lo va a ser.',
    plansLink: 'Mirá los planes',
    gratisHeadline: 'Estás en el plan Gratis.',
    gratisDetail: 'Lo que suma un plan pago es cómo te ve el estudiante y a qué accedés vos.',
    trialHeadline: (planName: string) => `Estás probando ${planName}.`,
    trialDetail: (endsOn: string) => `La prueba va hasta el ${endsOn}.`,
    activeHeadline: 'Tu plan está activo.',
    activeDetail: (endsOn: string) => `El período va hasta el ${endsOn}.`,
    openEndedDetail: 'El período no tiene fecha de término cargada.',
    endingSoonHeadline: (endsOn: string) => `Tu período termina el ${endsOn}.`,
    endingSoonDetail:
      'Te vamos a escribir para renovarlo. Si querés adelantarlo, contestá ese mismo hilo.',
    pastDueHeadline: 'Tenemos un pago pendiente de tu plan.',
    pastDueDetail: (endsOn: string, graceEndsOn: string) =>
      `El período terminó el ${endsOn} y tu plan sigue activo hasta el ${graceEndsOn} mientras se acredita la transferencia. Si ya la hiciste, escribinos y lo cerramos.`,
  },
} as const;
