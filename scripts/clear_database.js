/**
 * Clear All Database Data
 * 
 * This script clears ALL data from the LOCAL database.
 * Useful for fresh imports or resetting the database.
 * 
 * IMPORTANT: This only affects the LOCAL database, not Neon/production.
 * 
 * Usage:
 *   node scripts/clear_database.js              # Dry run (shows what would be cleared)
 *   node scripts/clear_database.js --confirm   # Actually clears all data
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

// Load .env.local first (higher priority), then .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// LOCAL database connection (not Neon)
function getLocalPool() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    console.warn('⚠️  WARNING: DATABASE_URL is set. This script should run on LOCAL database.');
    console.warn('   Make sure your .env has PGHOST, PGDATABASE, etc. (not DATABASE_URL)');
  }
  
  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'gyms',
  });
}

async function clearDatabase() {
  const pool = getLocalPool();
  const confirm = process.argv.includes('--confirm');
  
  try {
    // Verify we're connected to local database
    const dbCheck = await pool.query('SELECT current_database() as db_name');
    const dbName = dbCheck.rows[0].db_name;
    console.log(`📊 Connected to LOCAL database: ${dbName}\n`);
    
    // Get current table counts
    const tables = ['gym_votes', 'gym_style_votes', 'gym_utility_votes', 'feedback', 'gyms', 'users'];
    console.log('📈 Current Table Counts:');
    const tableStats = {};
    
    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = parseInt(result.rows[0].count);
        tableStats[table] = count;
        console.log(`  ${table}: ${count.toLocaleString()} rows`);
      } catch (error) {
        console.log(`  ${table}: (table does not exist)`);
        tableStats[table] = 0;
      }
    }
    
    if (!confirm) {
      console.log('\n⚠️  DRY RUN MODE - No changes will be made');
      console.log('   To actually clear the database, run with --confirm flag\n');
      console.log('   Example: node scripts/clear_database.js --confirm');
      console.log('\n   WARNING: This will DELETE ALL DATA in the database!');
      return;
    }
    
    // Actually clear the data
    console.log('\n🗑️  Clearing all data from LOCAL database...\n');
    
    // Clear tables in order (respecting foreign key constraints)
    // First clear dependent tables, then main tables
    
    const clearOrder = [
      'gym_utility_votes',
      'gym_style_votes', 
      'gym_votes',
      'feedback',
      'gyms',
      'users'
    ];
    
    let totalCleared = 0;
    
    for (const table of clearOrder) {
      try {
        const beforeResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const beforeCount = parseInt(beforeResult.rows[0].count);
        
        if (beforeCount > 0) {
          // Use TRUNCATE for efficiency (faster than DELETE)
          await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
          console.log(`  ✅ Cleared ${table}: ${beforeCount.toLocaleString()} rows`);
          totalCleared += beforeCount;
        } else {
          console.log(`  ℹ️  ${table}: Already empty`);
        }
      } catch (error) {
        console.log(`  ⚠️  ${table}: ${error.message}`);
      }
    }
    
    console.log(`\n✅ Cleared ${totalCleared.toLocaleString()} total rows from database`);
    
    // Verify all tables are empty
    console.log('\n📊 Verification (should all be 0):');
    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = parseInt(result.rows[0].count);
        const status = count === 0 ? '✅' : '❌';
        console.log(`  ${status} ${table}: ${count.toLocaleString()} rows`);
      } catch (error) {
        console.log(`  ⚠️  ${table}: (table does not exist)`);
      }
    }
    
    console.log('\n✅ Database cleared successfully!');
    console.log('   Run "npm run db:populate" to import fresh data');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

clearDatabase();

