# educacion.com.py

The complete, searchable, comparable index of every higher-education program in Paraguay.

Read [`CLAUDE.md`](./CLAUDE.md) and [`plan.md`](./plan.md) before touching this repo — they are the
source of truth for architecture, rules and the PR sequence. Docs live in [`docs/`](./docs).

## Stack

Next.js 15 (App Router, TypeScript, Tailwind CSS) + Drizzle ORM + MySQL, deployed on Hostinger
managed Node.js. Full rationale in [`docs/architecture.md`](./docs/architecture.md).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL etc. — see comments in the file
npm run dev
```

## Commands

```bash
npm run dev            # local dev server
npm run build          # production build — must pass before any PR
npm run lint            # ESLint — must pass before any PR
npm run typecheck      # tsc --noEmit
npm run format          # Prettier, writes
npm run format:check   # Prettier, check only
```

Database and data-pipeline scripts (`db:generate`, `db:migrate`, `import:cones`, `import:aneaes`,
`curate`, `search:rebuild`) ship with their owning PRs — see
[`docs/pr-plan.md`](./docs/pr-plan.md).

## Contributing

- One PR = one reviewable concern. Branch naming: `claude/pr-NN-short-slug`.
- `npm run build` and `npm run lint` must pass before opening a PR.
- Update the relevant doc in the same PR when a decision changes.
