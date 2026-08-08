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

/**
 * The card grid `/universidades/` publishes today: no table anywhere, one
 * `div.dc-card` per institution, a labelled contact blurb, and a link to the
 * institution's own page — which is where its carreras table lives.
 *
 * The second card's blurb deliberately runs "Ciudad: … URL: …" together: a
 * generic `word:` label reader mis-reads that as a label called "Ciudad de
 * Prueba URL" and loses the city.
 */
export const CONES_CARD_GRID_HTML = `
<html><body>
  <div class="dc-wrapper" data-categoria="universidades">
    <div class="dc-grid" id="dc-results">
      <div class="dc-card">
        <a href="/institucion-de-prueba-a/"><img src="/logo-a.png"></a>
        <div class="dc-card-body">
          <h3><a href="/institucion-de-prueba-a/">INSTITUCION DE PRUEBA A</a></h3>
          <p>Tel&eacute;fono: 000 000000 Direcci&oacute;n: Calle de Prueba 1 Web: https://a.test</p>
          <a class="dc-button" href="/institucion-de-prueba-a/">Ver informaci&oacute;n</a>
        </div>
      </div>
      <div class="dc-card">
        <div class="dc-card-body">
          <h3><a href="/institucion-de-prueba-b/">INSTITUCI&Oacute;N DE PRUEBA B</a></h3>
          <p>Direcci&oacute;n: Calle de Prueba 2 Ciudad: Ciudad de Prueba URL: www.b.test</p>
        </div>
      </div>
    </div>
    <div class="dc-pagination" id="dc-pagination">
      <span aria-current="page" class="page-numbers current">1</span>
      <a class="page-numbers" href="https://source.test/registro/page/2/">2</a>
      <a class="next page-numbers" href="https://source.test/registro/page/2/">&raquo;</a>
      <a href="https://source.test/otra-cosa/page/9/">otra secci&oacute;n</a>
      <a href="https://otro-sitio.test/registro/page/3/">otro sitio</a>
    </div>
  </div>
</body></html>
`;

/**
 * The wpDataTable of carreras, with the headers the register uses now: the
 * institution column is "IES", the level column is "Tipo", the resolution
 * column is "Documento respaldatorio", and there is no modality column at all.
 *
 * Row 3 is truncated mid-row — the live register does this — so it has no IES
 * cell and must be recovered from the table's own single institution.
 */
export const CONES_OFERTAS_TABLE_HTML = `
<table id="table_1" class="wpDataTable">
  <thead><tr>
    <th>Carrera/Programa</th><th>Tipo</th><th>Sede o Filial</th>
    <th>Documento respaldatorio</th><th>IES</th><th>Antecedentes</th><th>Estado</th>
  </tr></thead>
  <tbody>
    <tr id="table_1_row_0">
      <td>Carrera de Prueba Uno</td><td>Grado</td><td>Asunci&oacute;n</td>
      <td><a href="/docs/res-test-1.pdf">RES-TEST-1</a></td>
      <td>INSTITUCION DE PRUEBA A</td><td></td><td></td>
    </tr>
    <tr id="table_1_row_1">
      <td>Carrera de Prueba Dos</td><td>Postgrado</td><td>Sede de Prueba</td>
      <td><a href="/docs/res-test-2.pdf">RES-TEST-2</a></td>
      <td>INSTITUCION DE PRUEBA A</td><td>RES-TEST-0</td>
      <td><a href="#">INACTIVO</a></td>
    </tr>
    <tr id="table_1_row_2">
      <td>Carrera de Prueba Tres</td><td>Grado</td><td>Sede de Prueba</td>
      <td><a href="/docs/res-test-3.pdf">RES-TEST-3</a></td>
  </tbody>
</table>
`;

/** Two institutions in one table: no fallback is safe, so a truncated row is dropped. */
export const CONES_OFERTAS_TABLE_MIXED_HTML = `
<table>
  <tr><th>Carrera/Programa</th><th>Tipo</th><th>IES</th></tr>
  <tr><td>Carrera de Prueba Uno</td><td>Grado</td><td>INSTITUCION DE PRUEBA A</td></tr>
  <tr><td>Carrera de Prueba Dos</td><td>Grado</td><td>INSTITUCION DE PRUEBA B</td></tr>
  <tr><td>Carrera de Prueba Tres</td><td>Grado</td></tr>
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

/**
 * The shape a hand-transcribed listing takes: no resolution numbers, because
 * the source does not print any, and a per-row `Fuente` pointing at the
 * document that does say it. Rule 2 is satisfied by the URL alone.
 */
export const ANEAES_CSV_SOURCE_URL_ONLY = `Institucion,Carrera,Estado,Modelo,Resolucion,Fuente
INSTITUCION DE PRUEBA A,Carrera de Prueba Uno,Acreditada,Modelo Nacional,,https://source.test/listado.pdf
INSTITUCION DE PRUEBA B,Carrera de Prueba Dos,Acreditada,Modelo Nacional,,listado.pdf
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
