/** The mobile filter sheet — a client component, so this slice ships to the browser. */
export const filterSheetCopy = {
  trigger: 'Filtrar',
  triggerWithCount: (count: number) => `Filtrar (${count})`,
  dialogLabel: 'Filtrar carreras',
  heading: 'Filtrar',
  close: 'Cerrar',
  closeBackdrop: 'Cerrar filtros',
} as const;
