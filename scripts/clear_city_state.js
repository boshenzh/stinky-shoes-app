/**
 * Clear City/State Data from Local Database
 * 
 * This script clears all city/state information from the LOCAL database.
 * Useful for testing or resetting the enrichment process.
 * 
 * IMPORTANT: This only affects the LOCAL database, not Neon/production.
 * 
 * Usage:
 *   node scripts/clear_city_state.js              # Dry run (shows what would be cleared)
 *   node scripts/clear_city_state.js --confirm   # Actually clears the data
 *   node scripts/clear_city_state.js --confirm --cache  # Also clears geocoding_cache.json
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { existsSync, unlinkSync } from 'fs';

// Load .env.local first (higher priority), then .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Path to geocoding cache file
const CACHE_FILE = path.resolve(__dirname, '../data/seed/geocoding_cache.json');

// LOCAL database connection (not Neon)
function getLocalPool() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    // If DATABASE_URL is set, warn user
    console.warn('⚠️  WARNING: DATABASE_URL is set. This script should run on LOCAL database.');
    console.warn('   Make sure your .env has PGHOST, PGDATABASE, etc. (not DATABASE_URL)');
  }
  
  // Use individual PG* variables for local database
  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'gyms',
  });
}

async function clearCityState() {
  const pool = getLocalPool();
  const confirm = process.argv.includes('--confirm');
  const clearCache = process.argv.includes('--cache');
  
  try {
    // Verify we're connected to local database
    const dbCheck = await pool.query('SELECT current_database() as db_name');
    const dbName = dbCheck.rows[0].db_name;
    console.log(`📊 Connected to LOCAL database: ${dbName}\n`);
    
    // Get current statistics
    const statsBefore = await pool.query(`
      SELECT 
        COUNT(*) as total_gyms,
        COUNT(CASE WHEN city IS NOT NULL AND city != '' THEN 1 END) as gyms_with_city,
        COUNT(CASE WHEN state IS NOT NULL AND state != '' THEN 1 END) as gyms_with_state,
        COUNT(CASE WHEN city IS NOT NULL AND city != '' AND state IS NOT NULL AND state != '' THEN 1 END) as gyms_with_both
      FROM gyms
    `);
    const before = statsBefore.rows[0];
    
    console.log('📈 Current Statistics:');
    console.log(`  Total gyms: ${parseInt(before.total_gyms).toLocaleString()}`);
    console.log(`  With city: ${parseInt(before.gyms_with_city).toLocaleString()}`);
    console.log(`  With state: ${parseInt(before.gyms_with_state).toLocaleString()}`);
    console.log(`  With both: ${parseInt(before.gyms_with_both).toLocaleString()}\n`);
    
    if (!confirm) {
      console.log('⚠️  DRY RUN MODE - No changes will be made');
      console.log('   To actually clear the data, run with --confirm flag\n');
      console.log('   Example: node scripts/clear_city_state.js --confirm');
      
      if (clearCache) {
        console.log('\n📦 Geocoding cache file:');
        if (existsSync(CACHE_FILE)) {
          console.log(`   Found: ${CACHE_FILE}`);
          console.log('   Would be deleted (run with --confirm to actually delete)');
        } else {
          console.log(`   Not found: ${CACHE_FILE}`);
        }
      }
      
      return;
    }
    
    // Actually clear the data
    console.log('🗑️  Clearing city/state data from LOCAL database...\n');
    
    const result = await pool.query(`
      UPDATE gyms 
      SET 
        city = NULL,
        state = NULL,
        updated_at = now()
      WHERE city IS NOT NULL OR state IS NOT NULL
    `);
    
    const clearedCount = result.rowCount;
    console.log(`✅ Cleared city/state data from ${clearedCount} gyms\n`);
    
    // Clear cache file if requested
    if (clearCache) {
      console.log('📦 Clearing geocoding cache file...');
      if (existsSync(CACHE_FILE)) {
        unlinkSync(CACHE_FILE);
        console.log(`✅ Deleted: ${CACHE_FILE}\n`);
      } else {
        console.log(`ℹ️  Cache file not found: ${CACHE_FILE}\n`);
      }
    }
    
    // Get statistics after
    const statsAfter = await pool.query(`
      SELECT 
        COUNT(*) as total_gyms,
        COUNT(CASE WHEN city IS NOT NULL AND city != '' THEN 1 END) as gyms_with_city,
        COUNT(CASE WHEN state IS NOT NULL AND state != '' THEN 1 END) as gyms_with_state,
        COUNT(CASE WHEN city IS NOT NULL AND city != '' AND state IS NOT NULL AND state != '' THEN 1 END) as gyms_with_both
      FROM gyms
    `);
    const after = statsAfter.rows[0];
    
    console.log('📈 Statistics After Clearing:');
    console.log(`  Total gyms: ${parseInt(after.total_gyms).toLocaleString()}`);
    console.log(`  With city: ${parseInt(after.gyms_with_city).toLocaleString()}`);
    console.log(`  With state: ${parseInt(after.gyms_with_state).toLocaleString()}`);
    console.log(`  With both: ${parseInt(after.gyms_with_both).toLocaleString()}\n`);
    
    console.log('✅ City/state data cleared successfully!');
    console.log('   Run "npm run db:enrich-local -- --api" to re-enrich with Google API');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

clearCityState();

