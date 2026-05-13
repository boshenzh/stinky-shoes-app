// One-shot read-only inspection of the production schema: does api_tokens exist?
// Safe to delete after verification.
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.production' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const queries = [
  `SELECT to_regclass('public.api_tokens') AS api_tokens_oid`,
  `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='api_tokens'
     ORDER BY ordinal_position`,
  `SELECT indexname FROM pg_indexes
     WHERE schemaname='public' AND tablename='api_tokens'
     ORDER BY indexname`,
  `SELECT count(*)::int AS users_count FROM users`,
];

try {
  for (const q of queries) {
    const r = await pool.query(q);
    console.log('---', q.split('\n')[0], '---');
    console.log(r.rows);
  }
} catch (e) {
  console.error('ERR', e.code, e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
