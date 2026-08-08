'use server';

import { revalidatePath } from 'next/cache';

import { bulkVerify, type VerifiableTable } from '@/db/queries/admin/staleness';
import { currentUser } from '@/lib/auth/session';

export interface BulkVerifyState {
  error?: string;
  message?: string;
}

const TABLES: readonly VerifiableTable[] = ['prices', 'accreditations', 'admissions'];

/**
 * "Confirmo que estos siguen vigentes."
 *
 * That is the whole semantics, and the wording on the page says exactly that.
 * Nothing here re-reads a source — nothing in this codebase can — so a bulk
 * verify is a dated, attributed human assertion, and `bulkVerify` logs it as
 * one. It refuses an empty selection and caps at 200 rows, because the value of
 * `verified_at` is that somebody looked (`risks.md` §R-03).
 */
export async function bulkVerifyAction(
  _prevState: BulkVerifyState,
  formData: FormData,
): Promise<BulkVerifyState> {
  const user = await currentUser();

  const table = String(formData.get('tabla') ?? '') as VerifiableTable;
  if (!TABLES.includes(table)) return { error: 'Tabla desconocida.' };

  const ids = formData
    .getAll('id')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  try {
    const { updated } = await bulkVerify(user, table, ids);
    revalidatePath('/admin/frescura');
    revalidatePath('/carreras');
    return {
      message: `Marcaste ${updated} ${updated === 1 ? 'registro' : 'registros'} como verificados hoy.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo verificar.' };
  }
}
