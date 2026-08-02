const guaranies = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

/** Formats an integer amount of guaraníes as "Gs. 1.450.000". */
export function formatGs(amount: number): string {
  return `Gs. ${guaranies.format(amount)}`;
}
