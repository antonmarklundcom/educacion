/** Formats a duration in months as "4 años" / "4 años y 6 meses" / "8 meses". */
export function formatDurationMonths(months: number): string {
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  const yearsLabel = years > 0 ? `${years} ${years === 1 ? 'año' : 'años'}` : '';
  const monthsLabel =
    remainingMonths > 0 ? `${remainingMonths} ${remainingMonths === 1 ? 'mes' : 'meses'}` : '';

  if (yearsLabel && monthsLabel) return `${yearsLabel} y ${monthsLabel}`;
  return yearsLabel || monthsLabel || '0 meses';
}
