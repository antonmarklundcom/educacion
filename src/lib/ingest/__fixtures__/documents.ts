/**
 * Fixtures for the ingestion tests.
 *
 * **These contain no real data, deliberately.** CLAUDE.md rule 1 forbids
 * fabricated aranceles, accreditation statuses and resolution numbers in test
 * fixtures as much as in the UI, and the risk here is specific: a fixture that
 * pairs a real university with an invented resolution number is exactly the
 * string that later gets copied into a seed script by someone in a hurry.
 *
 * So every institution here is `INSTITUCION DE PRUEBA <letter>` and every
 * resolution is `RES-TEST-<n>`. What these fixtures assert is *shape* —
 * column order, entity encoding, quoting, nesting — which is the only thing
 * the parsers actually decide. The real markup is unavailable from CI anyway
 * (`docs/data-sources.md` §1); a human validates against a saved page with
 * `--dry-run`.
 */

/** Columns in a plausible register order, with a resolution link. */
export const CONES_REGISTER_HTML = `
<html><body>
  <table class="nav"><tr><td>Inicio</td><td>Contacto</td></tr></table>
  <table id="registro">
    <tr>
      <th>C&oacute;digo</th><th>Instituci&oacute;n</th><th>Carrera</th>
      <th>Nivel</th><th>Modalidad</th><th>Sede</th><th>Resoluci&oacute;n</th>
    </tr>
    <tr>
      <td>C-001</td>
      <td>INSTITUCION DE PRUEBA A</td>
      <td>Carrera de Prueba Uno</td>
      <td>Grado</td>
      <td>Presencial</td>
      <td>Asunci&oacute;n</td>
      <td><a href="/docs/res-test-1.pdf">Res. N&deg; RES-TEST-1</a></td>
    </tr>
    <tr>
      <td>C-002</td>
      <td>INSTITUCI&Oacute;N DE PRUEBA B</td>
      <td>Carrera de Prueba Dos</td>
      <td>Maestr&iacute;a</td>
      <td>A distancia</td>
      <td>Encarnaci&oacute;n</td>
      <td>Res. N&deg; RES-TEST-2</td>
    </tr>
  </table>
</body></html>
`;

/** Same rows, columns reordered — the parser must address them by header. */
export const CONES_REGISTER_HTML_REORDERED = `
<table>
  <tr><th>Instituci&oacute;n</th><th>Resoluci&oacute;n</th><th>Carrera</th><th>C&oacute;digo</th></tr>
  <tr>
    <td>INSTITUCION DE PRUEBA A</td>
    <td>Res. N&deg; RES-TEST-1</td>
    <td>Carrera de Prueba Uno</td>
    <td>C-001</td>
  </tr>
</table>
`;

/** Institution-level rows: no carrera column at all. */
export const CONES_INSTITUTIONS_HTML = `
<table>
  <tr><th>C&oacute;digo</th><th>Instituci&oacute;n</th><th>Resoluci&oacute;n</th></tr>
  <tr><td>C-001</td><td>INSTITUCION DE PRUEBA A</td><td>Res. N&deg; RES-TEST-1</td></tr>
  <tr><td>C-002</td><td>INSTITUCION DE PRUEBA B</td><td></td></tr>
</table>
`;

/** A CKAN-style export, with a quoted comma and an accented header. */
export const ANEAES_CSV = `Institucion,Carrera,Estado,Modelo,Resolucion,Vigencia desde,Vigencia hasta
INSTITUCION DE PRUEBA A,"Carrera de Prueba, con coma",Acreditada,Modelo Nacional,RES-TEST-10,2024-01-01,2029-01-01
INSTITUCION DE PRUEBA B,Carrera de Prueba Tres,Acreditada,ARCU-SUR,RES-TEST-11,2023-06-01,2028-06-01
INSTITUCION DE PRUEBA C,Carrera de Prueba Cuatro,En proceso,Modelo Nacional,,,
`;

/** Semicolon-delimited, BOM-prefixed — what Excel produces in an es locale. */
export const ANEAES_CSV_SEMICOLON = `﻿Institucion;Carrera;Estado;Resolucion
INSTITUCION DE PRUEBA A;Carrera de Prueba Uno;Acreditada;RES-TEST-10
`;

export const ANEAES_LISTING_HTML = `
<table>
  <tr>
    <th>Instituci&oacute;n</th><th>Carrera</th><th>Estado</th>
    <th>Resoluci&oacute;n</th><th>Vigencia hasta</th>
  </tr>
  <tr>
    <td>INSTITUCION DE PRUEBA A</td>
    <td>Carrera de Prueba Uno</td>
    <td>Acreditada</td>
    <td><a href="https://example.test/res-test-10.pdf">RES-TEST-10</a></td>
    <td>2029-01-01</td>
  </tr>
  <tr>
    <td>INSTITUCION DE PRUEBA C</td>
    <td>Carrera de Prueba Cuatro</td>
    <td>En proceso</td>
    <td></td>
    <td></td>
  </tr>
</table>
`;
