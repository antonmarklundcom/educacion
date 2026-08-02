const longDate = new Intl.DateTimeFormat('es-PY', { dateStyle: 'long' });
const monthYear = new Intl.DateTimeFormat('es-PY', { month: 'long', year: 'numeric' });

/** "2 de agosto de 2026" */
export function formatDate(date: Date | string): string {
  return longDate.format(typeof date === 'string' ? new Date(date) : date);
}

/** "agosto de 2026" — used in "Actualizado: {mes año}" per docs/seo.md §3. */
export function formatMonthYear(date: Date | string): string {
  return monthYear.format(typeof date === 'string' ? new Date(date) : date);
}
