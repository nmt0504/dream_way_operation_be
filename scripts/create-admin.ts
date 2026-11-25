// Creates the first admin account. The password is temporary: it must be changed at first login.
// Usage: pnpm admin:create --phone 0912345678 --name "Nguyễn Văn A" --password 'TempPass123'
import { parseArgs } from 'node:util';

import { db, pool } from '../src/db';
import { users } from '../src/db/schema';
import { hashPassword } from '../src/lib/password';

async function main() {
  const { values } = parseArgs({
    options: {
      phone: { type: 'string' },
      name: { type: 'string' },
      password: { type: 'string' },
    },
  });
  if (!values.phone || !values.name || !values.password || values.password.length < 8) {
    throw new Error(
      'Required: --phone 0xxxxxxxxx --name "Full name" --password <at least 8 chars>',
    );
  }

  const [admin] = await db
    .insert(users)
    .values({
      phone: values.phone,
      fullName: values.name,
      role: 'admin',
      passwordHash: await hashPassword(values.password),
    })
    .returning({ id: users.id });
  console.log(`Admin created: ${admin?.id}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
