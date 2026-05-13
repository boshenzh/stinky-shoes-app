// Applies only the api_tokens additive migration. Idempotent.
// Uses the unpooled (direct) connection — Neon's pooler is fine for DDL too,
// but the direct endpoint avoids any session-level surprises.
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

const MIGRATION = `
CREATE TABLE IF NOT EXISTS api_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  token_prefix  text NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_tokens_user_id_idx ON api_tokens(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_active_hash_idx
  ON api_tokens(token_hash) WHERE revoked_at IS NULL;
`;

try {
  console.log('Applying api_tokens migration…');
  await pool.query(MIGRATION);
  console.log('Migration applied. Re-verifying…');

  const check = await pool.query(`
    SELECT
      to_regclass('public.api_tokens')::text AS oid,
      (SELECT count(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='api_tokens')::int AS column_count,
      (SELECT count(*) FROM pg_indexes
        WHERE schemaname='public' AND tablename='api_tokens')::int AS index_count
  `);
  console.log(check.rows[0]);

  const cols = await pool.query(`
    SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='api_tokens'
      ORDER BY ordinal_position
  `);
  console.log('columns:', cols.rows);

  const idx = await pool.query(`
    SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='api_tokens'
      ORDER BY indexname
  `);
  console.log('indexes:', idx.rows.map(r => r.indexname));
} catch (e) {
  console.error('ERR', e.code, e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
