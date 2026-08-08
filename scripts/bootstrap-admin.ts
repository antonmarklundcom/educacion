/**
 * Create the first admin account.
 *
 * `pr-plan.md` PR-18: "seeded default credentials impossible to leave in place
 * (bootstrap forces a password change)". This script satisfies that in three
 * ways, and each one is deliberate:
 *
 * 1. **There is no default password.** The script generates a random one and
 *    prints it once. A constant in a repo is a credential in a repo, and it
 *    would be on the internet within a week of the first deploy.
 * 2. **The account is created with `must_change_password = true`,** so the
 *    printed password buys exactly one sign-in and nothing more.
 * 3. **It refuses to run twice.** An existing active admin means someone has
 *    already bootstrapped; re-running would be a way to mint a second admin
 *    from the shell rather than through the admin UI, which is precisely the
 *    backdoor this file must not become.
 *
 * Usage (tsx does NOT load .env — docs/deployment.md §5):
 *
 *   export DATABASE_URL="mysql://…"
 *   export SESSION_SECRET="…"
 *   npx tsx scripts/bootstrap-admin.ts --email admin@educacion.com.py --name "Nombre"
 */

import { randomBytes } from 'node:crypto';

import { createDb, createPool } from '../src/db';
import { createAccount, findAccountByEmail, hasActiveAdmin } from '../src/db/queries/auth';
import { hashPassword } from '../src/lib/auth/password';

interface Options {
  email: string;
  name: string | null;
}

export function parseArgs(argv: readonly string[]): Options {
  let email = '';
  let name: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--email') email = argv[++i] ?? '';
    else if (arg.startsWith('--email=')) email = arg.slice('--email='.length);
    else if (arg === '--name') name = argv[++i] ?? null;
    else if (arg.startsWith('--name=')) name = arg.slice('--name='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  // Not a validation library — just enough to catch a typo before it becomes an
  // admin account nobody can sign in to.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('--email needs a valid email address');
  }
  return { email, name };
}

/** 32 base64url characters: long enough that the one-time window is not a risk. */
function temporaryPassword(): string {
  return randomBytes(24).toString('base64url');
}

async function main(): Promise<void> {
  const { email, name } = parseArgs(process.argv.slice(2));

  const pool = createPool();
  const db = createDb(pool);

  try {
    if (await hasActiveAdmin(db)) {
      throw new Error(
        'An active admin already exists. Create further accounts from the admin UI, ' +
          'not from a shell — this script is the bootstrap, not a back door.',
      );
    }
    if (await findAccountByEmail(email, db)) {
      throw new Error(`An account already exists for ${email}.`);
    }

    const password = temporaryPassword();
    const id = await createAccount(
      {
        email,
        name,
        passwordHash: await hashPassword(password),
        role: 'admin',
        mustChangePassword: true,
      },
      db,
    );

    console.log('');
    console.log(`Admin account #${id} created for ${email}.`);
    console.log('');
    console.log(`  Temporary password:  ${password}`);
    console.log('');
    console.log('It is shown once and is not stored anywhere in readable form.');
    console.log('It is valid for exactly one sign-in: the account must set a new');
    console.log('password before it can do anything else.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
