# Decisions and inputs needed

Open questions and missing human inputs that block a planned PR. A session that hits one of
these appends a line here, commits, pushes and ends (`prompts/_handoff.md`, "Stopping early").
A line is removed by the PR it unblocks.

## Blocked on human input

- **PR-62 needs the ANEAES PDF committed at
  `data/sources/aneaes/Listado_de_acreditaciones_2024.pdf`.** It is not on `main`
  (2026-09-12). `prompts/sonnet-2-pr62-aneaes-transcription.md` forbids fetching a substitute
  — `*.gov.py` is unreachable from a build session and another document is not the source.
  Until the file lands, the 2024 accreditation list cannot be transcribed and
  `import:aneaes` has nothing to ingest. Already tracked as an unticked line in
  `docs/launch-runbook.md`.

- **PR-64 needs `data/editorial/sources/acreditacion.md`** — the URLs and quoted sentences of
  every source (ANEAES statement, MEC resolution, ABC Color coverage) the three accreditation
  posts may cite. It is not on `main` (2026-09-12).
  `prompts/sonnet-4-pr64-accreditation-posts.md` forbids searching the web for substitutes,
  and CLAUDE.md rule 1 forbids writing the claims without them, so the posts cannot be
  written at all until the file exists. Already tracked as an unticked line in
  `docs/launch-runbook.md`.

Both are inputs, not decisions: nothing needs to be chosen, the files need to be committed.
