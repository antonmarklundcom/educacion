/**
 * The total-cost calculator (PR-48).
 *
 * Server-only: `TotalCostBlock` and the comparador row are both server
 * components, and `client-bundle.test.ts` holds that line.
 */
export const totalCostCopy = {
  heading: 'Costo total de la carrera',
  /** Never dropped: a total that omits its own scope invites the wrong budget. */
  scopeNote:
    'Suma de la matrícula y las cuotas de cada año, más el derecho de examen. No incluye materiales, traslados ni otros gastos.',
  incompleteSuffix: 'total incompleto',
  freeNote: 'La carrera es gratuita: el total es el derecho de examen.',
  breakdown: {
    annual: 'Costo por año',
    duration: 'Duración',
    installments: 'Cuotas en total',
    admissionFee: 'Derecho de examen',
  },
  gaps: {
    arancel: 'sin datos de arancel',
    matricula: 'sin datos de matrícula',
    cuota: 'sin datos de cuota',
    cuotas_por_ano: 'no sabemos cuántas cuotas se pagan por año',
    derecho_examen: 'sin datos de derecho de examen',
    duracion: 'sin datos de duración',
    duracion_parcial: 'la duración no es un número entero de años',
  },
  /** The comparador cell when there is no total to show. */
  compareLabel: 'Costo total',
  cheapest: 'el más barato',
} as const;
