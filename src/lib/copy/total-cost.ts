/**
 * The total-cost calculator (PR-48).
 *
 * Server-only: `TotalCostBlock` and the comparador row are both server
 * components, and `client-bundle.test.ts` holds that line.
 *
 * `gaps` are noun phrases, joined after one `missingPrefix` — "sin datos de
 * matrícula, cuota y derecho de examen" rather than the same three words
 * three times. Noun phrases, strictly: `cuotas_por_ano` read "cuántas cuotas se
 * pagan por año" until PR-48b, which is a clause, and "sin datos de matrícula y
 * cuántas cuotas se pagan por año" is not a sentence. `undetermined` is a separate list on purpose: those two cases
 * are **not** absent data, and copy that says "sin datos" about a complete row
 * tells the reader something false about the institution.
 */
export const totalCostCopy = {
  heading: 'Costo total de la carrera',
  /** Never dropped: a total that omits its own scope invites the wrong budget. */
  scopeNote:
    'Suma de la matrícula y las cuotas de cada año, más el derecho de examen. No incluye materiales ni traslados, y algunas instituciones cobran aranceles diferenciados.',
  incompleteSuffix: 'total incompleto',
  missingPrefix: 'sin datos de',
  freeNote: 'La carrera es gratuita: el total es el derecho de examen.',
  zeroNote: 'Todos los montos cargados son cero.',
  /** Names the sede, because two sedes of one carrera can cost different amounts. */
  scopeLabel: (campusName: string) => `Sede ${campusName}`,
  breakdown: {
    annual: 'Costo por año',
    duration: 'Duración',
    installments: 'Cuotas en total',
    admissionFee: 'Derecho de examen',
  },
  gaps: {
    arancel: 'arancel',
    matricula: 'matrícula',
    cuota: 'cuota',
    cuotas_por_ano: 'cantidad de cuotas por año',
    derecho_examen: 'derecho de examen',
    duracion: 'duración',
  },
  /** Complete data that still does not determine a total. */
  undetermined: {
    duracion_parcial:
      'la carrera no dura un número entero de años, así que no sabemos cuántas matrículas se pagan',
    incoherente: 'el arancel figura como gratuito y a la vez tiene montos cargados',
    cuotas_invalidas:
      'la cantidad de cuotas por año que figura no es un número posible, así que no podemos multiplicar las cuotas',
  },
  /** The comparador cell when there is no total to show. */
  compareLabel: 'Costo total',
  cheapest: 'el más barato',
} as const;
