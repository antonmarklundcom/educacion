/**
 * Header and footer navigation chrome.
 *
 * This slice reaches the browser through `Header`, so it holds only what the
 * header renders — `architecture.md` §30.2.
 */
export const navCopy = {
  primaryLabel: 'Principal',
  mobileLabel: 'Principal, móvil',
  openMenu: 'Abrir menú',
  closeMenu: 'Cerrar menú',
  searchCta: 'Buscar carreras',
  links: {
    carreras: 'Carreras',
    universidades: 'Universidades',
    becas: 'Becas',
    acreditacion: 'Acreditación',
    paraInstituciones: 'Para instituciones',
  },
} as const;
