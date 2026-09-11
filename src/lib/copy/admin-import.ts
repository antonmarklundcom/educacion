/**
 * `/admin/importaciones` — the arancel CSV importer's copy (PR-61).
 *
 * A leaf slice, not on `client-bundle.test.ts`'s server-only list, because the
 * upload form is a justified client component (`useActionState` for the dry-run
 * table) and must import this file directly rather than the composed barrel.
 *
 * ### Why the caps explain themselves
 *
 * The operator here is a data assistant with a spreadsheet, not an engineer.
 * "Máximo 500 filas" with no reason reads as an arbitrary obstacle and gets
 * worked around by splitting the sheet at 499 and wondering; with the reason it
 * reads as a working batch size, which is what it is. Same for the file cap.
 */
import { MAX_IMPORT_ROWS } from '@/lib/admin/price-csv';

export const adminImportCopy = {
  heading: 'Importar aranceles (CSV)',
  intro:
    'Subí la planilla del relevamiento. Primero te mostramos fila por fila qué va a pasar; recién después escribimos.',
  fileLabel: 'Archivo CSV',
  dryRun: 'Ver qué va a pasar',
  dryRunPending: 'Leyendo…',
  apply: 'Confirmar e importar',
  applyPending: 'Importando…',
  /**
   * The confirm re-sends the file, so the note says so: the operator keeps the
   * file selected and clicks the second button, and nothing was staged on our
   * side in between.
   */
  applyNote:
    'Al confirmar volvemos a leer el mismo archivo. Si lo editaste después de la vista previa, se importa lo que diga ahora.',
  template:
    'La plantilla está en data/templates/aranceles.csv. El encabezado tiene que coincidir exactamente: si reordenás las columnas, no lo leemos.',
  rowCap: `Máximo ${MAX_IMPORT_ROWS} filas por corrida: cada fila es una transacción y un registro de actividad, y una tanda de este tamaño termina antes de que el servidor se canse de esperar. Una planilla más grande se parte en varias.`,
  sizeCap:
    'Máximo 512 KB por archivo. Es mucho más de lo que ocupan 500 filas de esta planilla: si tu archivo pesa más, casi seguro no es esta planilla.',
  noFile: 'Elegí un archivo CSV.',
  tooLarge: 'El archivo pesa más de 512 KB. Revisá que sea la planilla de aranceles.',
  /** The verdict column, in the words the table uses. */
  verdicts: {
    create: 'Nuevo arancel',
    supersede: 'Reemplaza al actual',
    error: 'No se importa',
  },
  /**
   * Three numbers rather than the report object: the catalog's own test renders
   * every leaf with marker arguments to prove the wording, and an object
   * parameter renders as `undefined` there — a string nobody can read in review
   * is exactly what that test exists to prevent.
   */
  summary: (create: number, supersede: number, errors: number) =>
    `${create} nuevos · ${supersede} reemplazan al actual · ${errors} con error`,
  appliedMessage: (applied: number, errors: number) =>
    errors === 0
      ? `Importamos ${applied} ${applied === 1 ? 'arancel' : 'aranceles'}.`
      : `Importamos ${applied} ${applied === 1 ? 'arancel' : 'aranceles'} y dejamos ${errors} sin importar. Corregí esas filas y volvé a subir solo esas.`,
  emptyResult: 'No hay filas para mostrar.',
  columns: {
    line: 'Fila',
    offering: 'Oferta',
    verdict: 'Qué pasa',
    detail: 'Detalle',
  },
} as const;
