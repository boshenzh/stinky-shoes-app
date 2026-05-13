// Enforces the "one active token per user" policy at the DB level.
// Idempotent: re-running is a no-op.
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.production' });

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error('No DATABASE_URL_UNPOOLED / POSTGRES_URL_NON_POOLING / DATABASE_URL in env');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

// If two active tokens already exist for some user, the unique index creation
// would fail. Pre-clean by revoking all but the newest one per user.
const PRECLEAN = `
  UPDATE api_tokens t
     SET revoked_at = now()
   WHERE revoked_at IS NULL
     AND id NOT IN (
       SELECT DISTINCT ON (user_id) id
         FROM api_tokens
        WHERE revoked_at IS NULL
        ORDER BY user_id, created_at DESC
     )
`;

const MIGRATION = `
  CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_one_active_per_user_idx
    ON api_tokens(user_id) WHERE revoked_at IS NULL;
`;

try {
  const pre = await pool.query(PRECLEAN);
  console.log(`Pre-cleaned ${pre.rowCount} duplicate active token(s).`);

  await pool.query(MIGRATION);
  console.log('Applied partial unique index.');

  const idx = await pool.query(`
    SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='api_tokens'
        AND indexname='api_tokens_one_active_per_user_idx'
  `);
  console.log('verified index present:', idx.rows.length === 1);
} catch (e) {
  console.error('ERR', e.code, e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
