/**
 * Run a SQL migration file against local Postgres and/or Neon.
 *
 * Usage:
 *   node scripts/run_migration.mjs scripts/migrations/001_add_business_status.sql
 *   node scripts/run_migration.mjs scripts/migrations/001_add_business_status.sql --target=local
 *   node scripts/run_migration.mjs scripts/migrations/001_add_business_status.sql --target=neon
 *   node scripts/run_migration.mjs scripts/migrations/001_add_business_status.sql --target=both
 *
 * Default target: local. Neon connections prompt for confirmation before running.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { Pool } from 'pg';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function getLocalPool() {
  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'gyms',
  });
}

function getNeonPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set in .env.local');
  return new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

async function runOn(pool, sql, label) {
  console.log(`\n--- Running migration on ${label} ---`);
  const db = await pool.query('SELECT current_database() as db');
  console.log(`Connected to: ${db.rows[0].db}`);
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log(`✅ Migration applied to ${label}`);
  } finally {
    client.release();
  }
}

async function main() {
  const sqlPath = process.argv[2];
  if (!sqlPath) {
    console.error('Usage: node scripts/run_migration.mjs <sql-file> [--target=local|neon|both]');
    process.exit(2);
  }
  const targetArg = process.argv.find(a => a.startsWith('--target='));
  const target = targetArg ? targetArg.split('=')[1] : 'local';
  if (!['local', 'neon', 'both'].includes(target)) {
    console.error(`Invalid --target: ${target}`);
    process.exit(2);
  }

  const abs = path.isAbsolute(sqlPath) ? sqlPath : path.resolve(process.cwd(), sqlPath);
  if (!existsSync(abs)) {
    console.error(`SQL file not found: ${abs}`);
    process.exit(2);
  }
  const sql = readFileSync(abs, 'utf8');
  console.log(`Migration file: ${abs}`);
  console.log(`Target: ${target}`);

  if (target === 'local' || target === 'both') {
    const pool = getLocalPool();
    try {
      await runOn(pool, sql, 'LOCAL');
    } finally {
      await pool.end();
    }
  }

  if (target === 'neon' || target === 'both') {
    const answer = await prompt(`\n⚠️  About to run migration on PRODUCTION NEON DB.\nType "yes" to continue: `);
    if (answer.trim().toLowerCase() !== 'yes') {
      console.error('Aborted.');
      process.exit(1);
    }
    const pool = getNeonPool();
    try {
      await runOn(pool, sql, 'NEON');
    } finally {
      await pool.end();
    }
  }

  console.log('\nDone.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
