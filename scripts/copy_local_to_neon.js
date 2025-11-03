/**
 * Copy Local Database to Neon Database
 * 
 * This script copies all data from your LOCAL database to Neon database:
 * - Users, Gyms, Votes, Feedback
 * - Handles geometry fields correctly
 * - Clears existing Neon data before copying
 * 
 * Usage:
 *   node scripts/copy_local_to_neon.js
 * 
 * Requirements:
 *   - LOCAL database: PGHOST, PGDATABASE, etc. in .env
 *   - NEON database: DATABASE_URL in .env.local
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

// Local database connection
function getLocalPool() {
  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'gyms',
  });
}

// Neon database connection
function getNeonPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not found in environment variables');
  }
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
}

async function copyTable(localPool, neonPool, tableName, columns, specialHandling = {}) {
  console.log(`\n📦 Copying ${tableName}...`);
  
  // Handle geometry columns specially - convert to WKT for transfer
  const selectColumns = columns.map(col => {
    if (col === 'geom' && specialHandling.geom === 'geography') {
      // Return expanded geometry columns instead of 'geom'
      return `ST_AsText(geom::geometry) as geom_text, ST_X(geom::geometry) as geom_lng, ST_Y(geom::geometry) as geom_lat`;
    }
    return col;
  }).join(', ');
  
  const result = await localPool.query(`SELECT ${selectColumns} FROM ${tableName}`);
  const rows = result.rows;
  
  if (rows.length === 0) {
    console.log(`  ⚠️  No data in local ${tableName} table`);
    return 0;
  }
  
  console.log(`  📊 Found ${rows.length} rows in local database`);
  
  // Clear existing data in Neon
  console.log(`  🗑️  Clearing existing data in Neon ${tableName}...`);
  await neonPool.query(`TRUNCATE TABLE ${tableName} CASCADE`);
  
  // Insert in batches
  const BATCH_SIZE = 100;
  let inserted = 0;
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values = [];
    const params = [];
    let paramIndex = 1;
    
    for (const row of batch) {
      const rowValues = [];
      for (const col of columns) {
        if (col === 'geom' && specialHandling.geom === 'geography') {
          // Reconstruct geometry from WKT or coordinates
          if (row.geom_text) {
            rowValues.push(`ST_SetSRID(ST_GeomFromText($${paramIndex}), 4326)::geography`);
            params.push(row.geom_text);
          } else if (row.geom_lng && row.geom_lat) {
            rowValues.push(`ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex + 1}), 4326)::geography`);
            params.push(row.geom_lng, row.geom_lat);
          } else {
            rowValues.push(`NULL`);
          }
          paramIndex += (row.geom_text ? 1 : 2);
        } else {
          rowValues.push(`$${paramIndex}`);
          params.push(row[col]);
          paramIndex++;
        }
      }
      values.push(`(${rowValues.join(', ')})`);
    }
    
    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${values.join(', ')}
      ON CONFLICT DO NOTHING
    `;
    
    await neonPool.query(query, params);
    inserted += batch.length;
    
    if (i % 1000 === 0 || i + BATCH_SIZE >= rows.length) {
      console.log(`  ✅ Inserted ${inserted}/${rows.length} rows...`);
    }
  }
  
  console.log(`✅ Copied ${inserted} rows to Neon ${tableName}`);
  return inserted;
}

async function main() {
  const localPool = getLocalPool();
  const neonPool = getNeonPool();
  
  try {
    // Verify connections
    console.log('🔌 Verifying connections...');
    const localDb = await localPool.query('SELECT current_database() as db_name');
    const neonDb = await neonPool.query('SELECT current_database() as db_name');
    console.log(`✅ Local database: ${localDb.rows[0].db_name}`);
    console.log(`✅ Neon database: ${neonDb.rows[0].db_name}`);
    
    // Check counts
    const localCount = await localPool.query('SELECT COUNT(*) as count FROM gyms');
    const neonCount = await neonPool.query('SELECT COUNT(*) as count FROM gyms');
    console.log(`\n📊 Local gyms: ${localCount.rows[0].count}`);
    console.log(`📊 Neon gyms: ${neonCount.rows[0].count}`);
    
    // Copy tables in order (respecting foreign key constraints)
    // 1. Users (no dependencies)
    await copyTable(
      localPool, 
      neonPool, 
      'users',
      ['id', 'username', 'password_hash', 'created_at', 'updated_at', 'email', 'display_name', 'preferences']
    );
    
    // 2. Gyms (no dependencies) - handle geometry specially
    await copyTable(
      localPool,
      neonPool,
      'gyms',
      ['id', 'provider', 'provider_poi_id', 'name', 'address', 'city', 'state', 'country_code', 'phone', 'type', 'geom', 'image_primary_url', 'raw', 'created_at', 'updated_at'],
      { geom: 'geography' }
    );
    
    // 3. Gym votes (depends on gyms and users)
    await copyTable(
      localPool,
      neonPool,
      'gym_votes',
      ['id', 'gym_id', 'user_id', 'username', 'smell', 'difficulty', 'parking_availability', 'pet_friendly', 'crimpy_pct', 'dynos_pct', 'overhang_pct', 'slab_pct', 'created_at', 'updated_at']
    );
    
    // 4. Gym style votes (depends on gyms and users)
    await copyTable(
      localPool,
      neonPool,
      'gym_style_votes',
      ['id', 'gym_id', 'user_id', 'username', 'style', 'created_at']
    );
    
    // 5. Gym utility votes (depends on gyms and users)
    await copyTable(
      localPool,
      neonPool,
      'gym_utility_votes',
      ['id', 'gym_id', 'user_id', 'username', 'utility_name', 'vote', 'created_at', 'updated_at']
    );
    
    // 6. Feedback (depends on users)
    await copyTable(
      localPool,
      neonPool,
      'feedback',
      ['id', 'feedback_type', 'message', 'user_id', 'user_name', 'user_email', 'timestamp', 'created_at', 'updated_at']
    );
    
    // Final count
    const finalNeonCount = await neonPool.query('SELECT COUNT(*) as count FROM gyms');
    console.log(`\n✅ Copy complete!`);
    console.log(`📊 Final Neon gym count: ${finalNeonCount.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await localPool.end();
    await neonPool.end();
  }
}

main();

