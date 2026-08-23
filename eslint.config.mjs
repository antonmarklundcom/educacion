import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // PR-34: the accessibility rules `next/core-web-vitals` ships as warnings,
    // promoted to errors so CI fails on them. Every one of these is a mistake
    // that makes the site unusable with a keyboard or a screen reader, and
    // "it's only a warning" is how a warning survives for a year.
    rules: {
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'either', depth: 3 }],
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      // Scratch checkouts of this repo, made for isolated review sessions.
      // Without this, `npm run lint` lints a second copy of the whole app plus
      // its `.next` output and reports thousands of problems that are not ours.
      '.claude/worktrees/**',
      // `npm run test:coverage`'s HTML report (PR-51). Generated, gitignored,
      // and full of vendored scripts that would otherwise be lint findings.
      'coverage/**',
    ],
  },
];

export default eslintConfig;
