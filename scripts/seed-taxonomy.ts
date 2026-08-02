/**
 * Taxonomy seed: areas, departamentos, ciudades.
 *
 * Idempotent — re-running leaves identical state. Rows are matched on their
 * natural key (`slug` / `code`) and updated in place, never duplicated, never
 * deleted. Run it as often as you like.
 *
 *   $env:DATABASE_URL = "mysql://user:pass@srvXXXX.hstgr.io:3306/dbname"
 *   npx tsx scripts/seed-taxonomy.ts
 *
 * tsx does NOT load .env — see docs/deployment.md §5.
 *
 * What is deliberately NOT seeded:
 *  - city coordinates. We do not have a sourced dataset, and inventing
 *    plausible lat/lng is exactly the kind of fabrication CLAUDE.md rule 1
 *    forbids. `cities.lat/lng` stay NULL until a real source fills them.
 *  - institutions, careers, programs. Those come from the CONES/ANEAES
 *    importers (PR-05/PR-06), never from a hand-written fixture.
 */

import { sql } from 'drizzle-orm';

import { createDb, createPool } from '../src/db';
import { areas, cities, departments } from '../src/db/schema';

/* -------------------------------------------------------------------------- */
/* Areas — our own browse taxonomy, mapped onto by the career matcher.        */
/* -------------------------------------------------------------------------- */

const AREAS = [
  { slug: 'salud', nameEs: 'Salud', icon: 'heart-pulse' },
  { slug: 'ingenieria-y-tecnologia', nameEs: 'Ingeniería y Tecnología', icon: 'cpu' },
  { slug: 'ciencias-empresariales', nameEs: 'Ciencias Empresariales', icon: 'briefcase' },
  { slug: 'derecho-y-ciencias-juridicas', nameEs: 'Derecho y Ciencias Jurídicas', icon: 'scale' },
  { slug: 'educacion', nameEs: 'Educación', icon: 'graduation-cap' },
  { slug: 'ciencias-sociales', nameEs: 'Ciencias Sociales', icon: 'users' },
  { slug: 'comunicacion', nameEs: 'Comunicación', icon: 'megaphone' },
  { slug: 'arte-y-diseno', nameEs: 'Arte y Diseño', icon: 'palette' },
  { slug: 'arquitectura-y-construccion', nameEs: 'Arquitectura y Construcción', icon: 'ruler' },
  {
    slug: 'ciencias-agrarias-y-veterinarias',
    nameEs: 'Ciencias Agrarias y Veterinarias',
    icon: 'sprout',
  },
  {
    slug: 'ciencias-exactas-y-naturales',
    nameEs: 'Ciencias Exactas y Naturales',
    icon: 'flask-conical',
  },
  { slug: 'humanidades', nameEs: 'Humanidades', icon: 'book-open' },
  { slug: 'turismo-y-hoteleria', nameEs: 'Turismo y Hotelería', icon: 'plane' },
  { slug: 'deportes', nameEs: 'Deportes', icon: 'activity' },
] as const;

/* -------------------------------------------------------------------------- */
/* Departamentos — the 17 departamentos plus the Distrito Capital (code 0).   */
/* -------------------------------------------------------------------------- */

const DEPARTMENTS = [
  { code: 0, slug: 'asuncion', nameEs: 'Asunción' },
  { code: 1, slug: 'concepcion', nameEs: 'Concepción' },
  { code: 2, slug: 'san-pedro', nameEs: 'San Pedro' },
  { code: 3, slug: 'cordillera', nameEs: 'Cordillera' },
  { code: 4, slug: 'guaira', nameEs: 'Guairá' },
  { code: 5, slug: 'caaguazu', nameEs: 'Caaguazú' },
  { code: 6, slug: 'caazapa', nameEs: 'Caazapá' },
  { code: 7, slug: 'itapua', nameEs: 'Itapúa' },
  { code: 8, slug: 'misiones', nameEs: 'Misiones' },
  { code: 9, slug: 'paraguari', nameEs: 'Paraguarí' },
  { code: 10, slug: 'alto-parana', nameEs: 'Alto Paraná' },
  { code: 11, slug: 'central', nameEs: 'Central' },
  { code: 12, slug: 'neembucu', nameEs: 'Ñeembucú' },
  { code: 13, slug: 'amambay', nameEs: 'Amambay' },
  { code: 14, slug: 'canindeyu', nameEs: 'Canindeyú' },
  { code: 15, slug: 'presidente-hayes', nameEs: 'Presidente Hayes' },
  { code: 16, slug: 'boqueron', nameEs: 'Boquerón' },
  { code: 17, slug: 'alto-paraguay', nameEs: 'Alto Paraguay' },
] as const;

type DepartmentSlug = (typeof DEPARTMENTS)[number]['slug'];

/* -------------------------------------------------------------------------- */
/* Ciudades — department capitals plus the districts that actually host       */
/* higher education. Extended by the importer as campuses appear elsewhere.   */
/* -------------------------------------------------------------------------- */

const CITIES: Array<{ slug: string; nameEs: string; department: DepartmentSlug }> = [
  { slug: 'asuncion', nameEs: 'Asunción', department: 'asuncion' },

  { slug: 'concepcion', nameEs: 'Concepción', department: 'concepcion' },
  { slug: 'horqueta', nameEs: 'Horqueta', department: 'concepcion' },

  { slug: 'san-pedro-de-ycuamandyyu', nameEs: 'San Pedro de Ycuamandyyú', department: 'san-pedro' },
  { slug: 'san-estanislao', nameEs: 'San Estanislao', department: 'san-pedro' },
  { slug: 'santa-rosa-del-aguaray', nameEs: 'Santa Rosa del Aguaray', department: 'san-pedro' },

  { slug: 'caacupe', nameEs: 'Caacupé', department: 'cordillera' },
  { slug: 'eusebio-ayala', nameEs: 'Eusebio Ayala', department: 'cordillera' },
  { slug: 'piribebuy', nameEs: 'Piribebuy', department: 'cordillera' },
  { slug: 'tobati', nameEs: 'Tobatí', department: 'cordillera' },
  { slug: 'arroyos-y-esteros', nameEs: 'Arroyos y Esteros', department: 'cordillera' },

  { slug: 'villarrica', nameEs: 'Villarrica', department: 'guaira' },
  { slug: 'independencia', nameEs: 'Independencia', department: 'guaira' },

  { slug: 'coronel-oviedo', nameEs: 'Coronel Oviedo', department: 'caaguazu' },
  { slug: 'caaguazu', nameEs: 'Caaguazú', department: 'caaguazu' },
  {
    slug: 'doctor-juan-eulogio-estigarribia',
    nameEs: 'Doctor Juan Eulogio Estigarribia',
    department: 'caaguazu',
  },
  { slug: 'repatriacion', nameEs: 'Repatriación', department: 'caaguazu' },

  { slug: 'caazapa', nameEs: 'Caazapá', department: 'caazapa' },
  { slug: 'san-juan-nepomuceno', nameEs: 'San Juan Nepomuceno', department: 'caazapa' },
  { slug: 'yuty', nameEs: 'Yuty', department: 'caazapa' },

  { slug: 'encarnacion', nameEs: 'Encarnación', department: 'itapua' },
  { slug: 'hohenau', nameEs: 'Hohenau', department: 'itapua' },
  { slug: 'obligado', nameEs: 'Obligado', department: 'itapua' },
  { slug: 'bella-vista', nameEs: 'Bella Vista', department: 'itapua' },
  { slug: 'coronel-bogado', nameEs: 'Coronel Bogado', department: 'itapua' },
  { slug: 'maria-auxiliadora', nameEs: 'María Auxiliadora', department: 'itapua' },
  { slug: 'natalio', nameEs: 'Natalio', department: 'itapua' },

  { slug: 'san-juan-bautista', nameEs: 'San Juan Bautista', department: 'misiones' },
  { slug: 'ayolas', nameEs: 'Ayolas', department: 'misiones' },
  { slug: 'san-ignacio', nameEs: 'San Ignacio', department: 'misiones' },
  { slug: 'santa-rosa', nameEs: 'Santa Rosa', department: 'misiones' },

  { slug: 'paraguari', nameEs: 'Paraguarí', department: 'paraguari' },
  { slug: 'carapegua', nameEs: 'Carapeguá', department: 'paraguari' },
  { slug: 'yaguaron', nameEs: 'Yaguarón', department: 'paraguari' },
  { slug: 'ybycui', nameEs: 'Ybycuí', department: 'paraguari' },

  { slug: 'ciudad-del-este', nameEs: 'Ciudad del Este', department: 'alto-parana' },
  { slug: 'hernandarias', nameEs: 'Hernandarias', department: 'alto-parana' },
  { slug: 'presidente-franco', nameEs: 'Presidente Franco', department: 'alto-parana' },
  { slug: 'minga-guazu', nameEs: 'Minga Guazú', department: 'alto-parana' },
  { slug: 'santa-rita', nameEs: 'Santa Rita', department: 'alto-parana' },
  { slug: 'santa-rosa-del-monday', nameEs: 'Santa Rosa del Monday', department: 'alto-parana' },

  { slug: 'aregua', nameEs: 'Areguá', department: 'central' },
  { slug: 'san-lorenzo', nameEs: 'San Lorenzo', department: 'central' },
  { slug: 'luque', nameEs: 'Luque', department: 'central' },
  { slug: 'capiata', nameEs: 'Capiatá', department: 'central' },
  { slug: 'lambare', nameEs: 'Lambaré', department: 'central' },
  { slug: 'fernando-de-la-mora', nameEs: 'Fernando de la Mora', department: 'central' },
  { slug: 'nemby', nameEs: 'Ñemby', department: 'central' },
  { slug: 'itaugua', nameEs: 'Itauguá', department: 'central' },
  { slug: 'mariano-roque-alonso', nameEs: 'Mariano Roque Alonso', department: 'central' },
  { slug: 'villa-elisa', nameEs: 'Villa Elisa', department: 'central' },
  { slug: 'san-antonio', nameEs: 'San Antonio', department: 'central' },
  { slug: 'limpio', nameEs: 'Limpio', department: 'central' },
  { slug: 'ita', nameEs: 'Itá', department: 'central' },
  { slug: 'guarambare', nameEs: 'Guarambaré', department: 'central' },
  { slug: 'villeta', nameEs: 'Villeta', department: 'central' },
  { slug: 'ypacarai', nameEs: 'Ypacaraí', department: 'central' },
  { slug: 'ypane', nameEs: 'Ypané', department: 'central' },
  { slug: 'julian-augusto-saldivar', nameEs: 'Julián Augusto Saldívar', department: 'central' },
  { slug: 'nueva-italia', nameEs: 'Nueva Italia', department: 'central' },

  { slug: 'pilar', nameEs: 'Pilar', department: 'neembucu' },

  { slug: 'pedro-juan-caballero', nameEs: 'Pedro Juan Caballero', department: 'amambay' },
  { slug: 'capitan-bado', nameEs: 'Capitán Bado', department: 'amambay' },

  { slug: 'salto-del-guaira', nameEs: 'Salto del Guairá', department: 'canindeyu' },
  { slug: 'curuguaty', nameEs: 'Curuguaty', department: 'canindeyu' },

  { slug: 'villa-hayes', nameEs: 'Villa Hayes', department: 'presidente-hayes' },
  { slug: 'benjamin-aceval', nameEs: 'Benjamín Aceval', department: 'presidente-hayes' },

  { slug: 'filadelfia', nameEs: 'Filadelfia', department: 'boqueron' },
  { slug: 'loma-plata', nameEs: 'Loma Plata', department: 'boqueron' },
  { slug: 'mariscal-estigarribia', nameEs: 'Mariscal Estigarribia', department: 'boqueron' },

  { slug: 'fuerte-olimpo', nameEs: 'Fuerte Olimpo', department: 'alto-paraguay' },
  { slug: 'puerto-casado', nameEs: 'Puerto Casado', department: 'alto-paraguay' },
];

/* -------------------------------------------------------------------------- */

async function main() {
  const pool = createPool();
  const db = createDb(pool);

  try {
    // Upsert on the natural key. `sort_order` follows array order so the
    // filter rail and the homepage tiles have a stable, editorial ordering.
    await db
      .insert(areas)
      .values(AREAS.map((a, i) => ({ ...a, sortOrder: i })))
      .onDuplicateKeyUpdate({
        set: {
          nameEs: sql`values(name_es)`,
          icon: sql`values(icon)`,
          sortOrder: sql`values(sort_order)`,
        },
      });

    await db
      .insert(departments)
      .values(DEPARTMENTS.map((d) => ({ ...d })))
      .onDuplicateKeyUpdate({ set: { nameEs: sql`values(name_es)`, code: sql`values(code)` } });

    const departmentRows = await db
      .select({ id: departments.id, slug: departments.slug })
      .from(departments);
    const departmentIdBySlug = new Map(departmentRows.map((d) => [d.slug, d.id]));

    await db
      .insert(cities)
      .values(
        CITIES.map((c) => {
          const departmentId = departmentIdBySlug.get(c.department);
          if (!departmentId) throw new Error(`Unknown department slug: ${c.department}`);
          return { slug: c.slug, nameEs: c.nameEs, departmentId };
        }),
      )
      .onDuplicateKeyUpdate({
        set: { nameEs: sql`values(name_es)`, departmentId: sql`values(department_id)` },
      });

    const [areaCount] = await db.select({ n: sql<number>`count(*)` }).from(areas);
    const [departmentCount] = await db.select({ n: sql<number>`count(*)` }).from(departments);
    const [cityCount] = await db.select({ n: sql<number>`count(*)` }).from(cities);

    console.log(
      `seed-taxonomy: areas=${areaCount.n} departments=${departmentCount.n} cities=${cityCount.n}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
