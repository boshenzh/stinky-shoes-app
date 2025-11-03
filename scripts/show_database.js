/**
 * Show Database Statistics
 * 
 * Displays database schema and statistics including:
 * - Table row counts
 * - City/state enrichment progress
 * - Sample data
 * 
 * Usage:
 *   node scripts/show_database.js          # Shows LOCAL database stats
 *   node scripts/show_database.js --neon  # Shows NEON database stats
 * 
 * Default: Connects to LOCAL database (PGHOST, PGDATABASE, etc. from .env)
 * Use --neon flag to connect to Neon database (DATABASE_URL from .env.local)
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

function getPool() {
  // Check command line argument for --neon flag
  const useNeon = process.argv.includes('--neon');
  
  if (useNeon) {
    // Explicitly use Neon (DATABASE_URL from .env.local)
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL not found. Set it in .env.local to use Neon database.');
    }
    console.log('🔗 Connecting to NEON database (from DATABASE_URL)...\n');
    return new Pool({
      connectionString,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
  }
  
  // Default: Use LOCAL database
  console.log('🔗 Connecting to LOCAL database (from PGHOST, PGDATABASE, etc.)...\n');
  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'gyms',
  });
}

async function showDatabase() {
  const pool = getPool();
  
  try {
    // Verify connection
    const dbInfo = await pool.query(`
      SELECT 
        current_database() as db_name,
        version() as pg_version
    `);
    const dbName = dbInfo.rows[0].db_name;
    const pgVersion = dbInfo.rows[0].pg_version.split(',')[0]; // Just the PostgreSQL version part
    
    console.log('📊 Database Statistics\n');
    console.log(`Database: ${dbName}`);
    console.log(`PostgreSQL: ${pgVersion}\n`);
    
    // Table counts and columns
    console.log('📈 Table Information:');
    const tables = ['users', 'gyms', 'gym_votes', 'gym_style_votes', 'gym_utility_votes', 'feedback'];
    for (const table of tables) {
      try {
        // Get row count
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const rowCount = parseInt(countResult.rows[0].count);
        
        // Get column information
        const columnsResult = await pool.query(`
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        `, [table]);
        
        console.log(`\n  📋 ${table}: ${rowCount.toLocaleString()} rows`);
        if (columnsResult.rows.length > 0) {
          console.log(`     Columns:`);
          for (const col of columnsResult.rows) {
            const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
            const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
            console.log(`       - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
          }
        } else {
          console.log(`     (no columns found)`);
        }
      } catch (error) {
        console.log(`  ${table}: (table does not exist)`);
      }
    }
    
    // City/State enrichment stats
    console.log('\n📍 City/State Enrichment Progress:');
    try {
      const cityStats = await pool.query(`
        SELECT 
          COUNT(*) as total_gyms,
          COUNT(CASE WHEN city IS NOT NULL AND city != '' THEN 1 END) as gyms_with_city,
          COUNT(CASE WHEN state IS NOT NULL AND state != '' THEN 1 END) as gyms_with_state,
          COUNT(CASE WHEN city IS NOT NULL AND city != '' AND state IS NOT NULL AND state != '' THEN 1 END) as gyms_with_both,
          COUNT(CASE WHEN (city IS NULL OR city = '') AND (state IS NULL OR state = '') THEN 1 END) as gyms_missing_both
        FROM gyms
      `);
      
      const stats = cityStats.rows[0];
      if (stats.total_gyms > 0) {
        console.log(`  Total gyms: ${parseInt(stats.total_gyms).toLocaleString()}`);
        console.log(`  With city: ${parseInt(stats.gyms_with_city).toLocaleString()} (${((stats.gyms_with_city / stats.total_gyms) * 100).toFixed(1)}%)`);
        console.log(`  With state: ${parseInt(stats.gyms_with_state).toLocaleString()} (${((stats.gyms_with_state / stats.total_gyms) * 100).toFixed(1)}%)`);
        console.log(`  With both: ${parseInt(stats.gyms_with_both).toLocaleString()} (${((stats.gyms_with_both / stats.total_gyms) * 100).toFixed(1)}%)`);
        console.log(`  Missing both: ${parseInt(stats.gyms_missing_both).toLocaleString()} (${((stats.gyms_missing_both / stats.total_gyms) * 100).toFixed(1)}%)`);
        
        // Stats by provider
        const providerStats = await pool.query(`
          SELECT 
            provider,
            COUNT(*) as total,
            COUNT(CASE WHEN city IS NOT NULL AND city != '' THEN 1 END) as with_city,
            COUNT(CASE WHEN state IS NOT NULL AND state != '' THEN 1 END) as with_state,
            COUNT(CASE WHEN city IS NOT NULL AND city != '' AND state IS NOT NULL AND state != '' THEN 1 END) as with_both
          FROM gyms
          GROUP BY provider
          ORDER BY total DESC
        `);
        
        if (providerStats.rows.length > 0) {
          console.log('\n  By Provider:');
          providerStats.rows.forEach(row => {
            console.log(`    ${row.provider || '(null)'}: ${parseInt(row.total).toLocaleString()} gyms`);
            console.log(`      - With city: ${parseInt(row.with_city).toLocaleString()} (${((row.with_city / row.total) * 100).toFixed(1)}%)`);
            console.log(`      - With state: ${parseInt(row.with_state).toLocaleString()} (${((row.with_state / row.total) * 100).toFixed(1)}%)`);
            console.log(`      - With both: ${parseInt(row.with_both).toLocaleString()} (${((row.with_both / row.total) * 100).toFixed(1)}%)`);
          });
        }
      }
    } catch (error) {
      console.log('  (Could not fetch city/state stats - table may not exist or missing columns)');
    }
    
    // Sample gyms with city/state
    console.log('\n📋 Sample Gyms WITH City/State (5 random):');
    try {
      const samplesWith = await pool.query(`
        SELECT name, city, state, country_code, provider
        FROM gyms 
        WHERE city IS NOT NULL AND city != '' AND state IS NOT NULL AND state != ''
        ORDER BY RANDOM()
        LIMIT 5
      `);
      
      if (samplesWith.rows.length > 0) {
        samplesWith.rows.forEach(g => {
          console.log(`  - ${g.name}`);
          console.log(`    City: ${g.city}, State: ${g.state}, Country: ${g.country_code || '(null)'}, Provider: ${g.provider || '(null)'}`);
        });
      } else {
        console.log('  (No gyms with city/state found)');
      }
    } catch (error) {
      console.log('  (Could not fetch sample gyms)');
    }
    
    // Sample gyms missing city/state
    console.log('\n📋 Sample Gyms MISSING City/State (5 random):');
    try {
      const samplesWithout = await pool.query(`
        SELECT name, city, state, country_code, provider,
               CASE WHEN raw IS NOT NULL THEN true ELSE false END as has_raw_data
        FROM gyms 
        WHERE (city IS NULL OR city = '') OR (state IS NULL OR state = '')
        ORDER BY RANDOM()
        LIMIT 5
      `);
      
      if (samplesWithout.rows.length > 0) {
        samplesWithout.rows.forEach(g => {
          console.log(`  - ${g.name}`);
          console.log(`    City: ${g.city || '(null)'}, State: ${g.state || '(null)'}, Country: ${g.country_code || '(null)'}, Provider: ${g.provider || '(null)'}`);
          console.log(`    Has raw data: ${g.has_raw_data}`);
        });
      } else {
        console.log('  (All gyms have city/state!)');
      }
    } catch (error) {
      console.log('  (Could not fetch sample gyms)');
    }
    
    // Vote statistics
    console.log('\n🗳️  Vote Statistics:');
    try {
      const voteStats = await pool.query(`
        SELECT 
          COUNT(DISTINCT gym_id) as gyms_with_votes,
          COUNT(DISTINCT COALESCE(user_id::text, username)) as unique_voters,
          COUNT(*) as total_votes,
          AVG(smell) as avg_smell,
          AVG(difficulty) as avg_difficulty
        FROM gym_votes
      `);
      
      const stats = voteStats.rows[0];
      if (stats.total_votes > 0) {
        console.log(`  Gyms with votes: ${parseInt(stats.gyms_with_votes).toLocaleString()}`);
        console.log(`  Unique voters: ${parseInt(stats.unique_voters).toLocaleString()}`);
        console.log(`  Total votes: ${parseInt(stats.total_votes).toLocaleString()}`);
        console.log(`  Average smell: ${stats.avg_smell ? parseFloat(stats.avg_smell).toFixed(1) : 'N/A'}`);
        console.log(`  Average difficulty: ${stats.avg_difficulty ? parseFloat(stats.avg_difficulty).toFixed(1) : 'N/A'}`);
      } else {
        console.log('  (No votes yet)');
      }
    } catch (error) {
      console.log('  (Could not fetch vote stats)');
    }
    
    console.log('\n✅ Statistics complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

showDatabase();

