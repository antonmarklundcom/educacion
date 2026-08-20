import { navCopy } from '@/lib/copy/nav';

export const navLinks = [
  { href: '/carreras', label: navCopy.links.carreras },
  { href: '/universidades', label: navCopy.links.universidades },
  { href: '/becas', label: navCopy.links.becas },
  { href: '/acreditacion', label: navCopy.links.acreditacion },
  { href: '/para-instituciones', label: navCopy.links.paraInstituciones },
] as const;
