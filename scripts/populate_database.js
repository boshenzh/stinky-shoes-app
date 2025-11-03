/**
 * Populate Database with Gym Data
 * 
 * This script populates the database with gym data in the correct order:
 * 1. Import China gyms (amap provider) from china_gyms.json - includes city/state
 * 2. Import Google gyms from world gyms seed files - basic info only
 * 3. Enrich Google gyms with city/state using Google API (cached in geocoding_cache.json)
 * 
 * IMPORTANT:
 * - amap gyms (China): City/state comes from seed file - NO API calls
 * - google gyms (world): City/state comes from Google API - cached for reuse
 * 
 * Usage:
 *   node scripts/populate_database.js                    # Import all, no API enrichment
 *   node scripts/populate_database.js --enrich           # Import all + enrich Google gyms with API
 *   node scripts/populate_database.js --enrich --limit=100  # Limit API calls to 100 gyms
 *   node scripts/populate_database.js --skip-import       # Skip import, only enrich existing Google gyms
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

// Load .env.local first (higher priority), then .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Paths to seed files
const CHINA_GYMS_FILE = path.resolve(__dirname, '../data/seed/china_gyms.json');
const WORLD_GYMS_GOOGLE_DETAILED = path.resolve(__dirname, '../data/seed/world_gyms_google_detailed.json');
const WORLD_GYMS_GOOGLE = path.resolve(__dirname, '../data/seed/world_gyms_google.json');
const CACHE_FILE = path.resolve(__dirname, '../data/seed/geocoding_cache.json');

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

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load geocoding cache
 */
function loadGeocodingCache() {
  if (!existsSync(CACHE_FILE)) {
    return {};
  }
  try {
    const data = readFileSync(CACHE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.warn(`⚠️  Warning: Could not load geocoding cache: ${error.message}`);
    return {};
  }
}

/**
 * Save geocoding cache
 */
function saveGeocodingCache(cache) {
  try {
    const cacheDir = path.dirname(CACHE_FILE);
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (error) {
    console.error(`❌ Error saving geocoding cache: ${error.message}`);
  }
}

/**
 * Get cached geocoding data for a gym
 */
function getCachedGeocoding(gymId, cache) {
  return cache[gymId] || null;
}

/**
 * Set cached geocoding data for a gym
 */
function setCachedGeocoding(gymId, geoData, cache) {
  cache[gymId] = {
    city: geoData.city || null,
    state: geoData.state || null,
    country_code: geoData.country_code || null,
    cached_at: new Date().toISOString()
  };
}

/**
 * Geocode coordinates using Google Maps Geocoding API
 */
async function geocodeLocation(lat, lng, address, apiKey) {
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not set');
  }

  let url;
  if (lat && lng && typeof lat === 'number' && typeof lng === 'number') {
    url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&result_type=locality|administrative_area_level_1|administrative_area_level_2|country`;
  } else if (address) {
    url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}&result_type=locality|administrative_area_level_1|administrative_area_level_2|country`;
  } else {
    return null;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Geocoding API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      if (data.status === 'OVER_QUERY_LIMIT') {
        console.warn('Rate limit hit, waiting 2 seconds...');
        await sleep(2000);
      }
      return null;
    }

    if (!data.results || data.results.length === 0) {
      return null;
    }

    const result = data.results[0];
    const components = result.address_components || [];
    
    let city = null;
    let state = null;
    let countryCode = null;

    for (const component of components) {
      const types = component.types || [];
      
      if (!city && (types.includes('locality') || types.includes('administrative_area_level_2'))) {
        city = component.long_name;
      }
      
      if (!state && types.includes('administrative_area_level_1')) {
        state = component.short_name || component.long_name;
      }
      
      if (!countryCode && types.includes('country')) {
        countryCode = component.short_name;
      }
    }

    return { city, state, country_code: countryCode };
  } catch (error) {
    console.error('Geocoding error:', error.message);
    return null;
  }
}

/**
 * Import China gyms (amap provider) from seed file
 */
async function importChinaGyms(pool) {
  console.log('📦 Step 1: Importing China gyms (amap provider)...\n');
  
  if (!existsSync(CHINA_GYMS_FILE)) {
    console.warn(`⚠️  Warning: China gyms file not found: ${CHINA_GYMS_FILE}`);
    return 0;
  }
  
  try {
    const data = readFileSync(CHINA_GYMS_FILE, 'utf8');
    const gyms = JSON.parse(data);
    
    const gymsArray = Array.isArray(gyms) ? gyms : Object.values(gyms);
    console.log(`  📊 Found ${gymsArray.length} China gyms in seed file`);
    
    if (gymsArray.length === 0) {
      console.log('  ⚠️  No China gyms to import');
      return 0;
    }
    
    // Batch insert
    const BATCH_SIZE = 100;
    let imported = 0;
    let skipped = 0;
    
    for (let i = 0; i < gymsArray.length; i += BATCH_SIZE) {
      const batch = gymsArray.slice(i, i + BATCH_SIZE);
      const values = [];
      const params = [];
      let paramIndex = 1;
      
      for (const gym of batch) {
        if (!gym.id || !gym.name || !gym.location) {
          skipped++;
          continue;
        }
        
        const lng = gym.location.lng || gym.location.lon || null;
        const lat = gym.location.lat || null;
        
        if (!lng || !lat) {
          skipped++;
          continue;
        }
        
        // China gyms have city/state in seed file
        const city = gym.city || null;
        const province = gym.province || null; // province maps to state
        const countryCode = 'CN';
        
        values.push(`(
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
          ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography,
          $${paramIndex++}, $${paramIndex++}
        )`);
        
        params.push(
          'amap',                                    // provider
          gym.id,                                    // provider_poi_id
          gym.name,                                  // name
          gym.address || null,                       // address
          city,                                      // city (from seed file)
          province,                                  // state (from seed file - province)
          countryCode,                              // country_code
          gym.phone || null,                         // phone
          lng,                                       // longitude
          lat,                                       // latitude
          gym.image || (gym.images && gym.images[0]) || null,     // image_primary_url
          JSON.stringify(gym)                        // raw
        );
      }
      
      if (values.length > 0) {
        const query = `
          INSERT INTO gyms (
            provider, provider_poi_id, name, address, city, state, country_code, phone, geom, image_primary_url, raw
          ) VALUES ${values.join(', ')}
          ON CONFLICT (provider, provider_poi_id) 
          DO UPDATE SET
            name = EXCLUDED.name,
            address = EXCLUDED.address,
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            country_code = EXCLUDED.country_code,
            phone = EXCLUDED.phone,
            image_primary_url = EXCLUDED.image_primary_url,
            raw = EXCLUDED.raw,
            updated_at = now()
        `;
        
        await pool.query(query, params);
        imported += batch.length; // Count all (inserts + updates)
      }
      
      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= gymsArray.length) {
        console.log(`  ✅ Processed ${imported}/${gymsArray.length} China gyms...`);
      }
    }
    
    console.log(`\n✅ Imported ${imported} China gyms (amap provider)`);
    console.log(`   Skipped: ${skipped} (missing required fields)\n`);
    return imported;
  } catch (error) {
    console.error(`❌ Error importing China gyms: ${error.message}`);
    throw error;
  }
}

/**
 * Import Google gyms (world gyms) from seed files
 */
async function importGoogleGyms(pool) {
  console.log('📦 Step 2: Importing Google gyms (world gyms)...\n');
  
  // Try detailed file first, fallback to basic file
  let gymsFile = null;
  if (existsSync(WORLD_GYMS_GOOGLE_DETAILED)) {
    gymsFile = WORLD_GYMS_GOOGLE_DETAILED;
    console.log('  📁 Using: world_gyms_google_detailed.json');
  } else if (existsSync(WORLD_GYMS_GOOGLE)) {
    gymsFile = WORLD_GYMS_GOOGLE;
    console.log('  📁 Using: world_gyms_google.json');
  } else {
    console.warn(`⚠️  Warning: Google gyms files not found`);
    return 0;
  }
  
  try {
    const data = readFileSync(gymsFile, 'utf8');
    const gyms = JSON.parse(data);
    
    const gymsArray = Array.isArray(gyms) ? gyms : Object.values(gyms);
    console.log(`  📊 Found ${gymsArray.length} Google gyms in seed file`);
    
    if (gymsArray.length === 0) {
      console.log('  ⚠️  No Google gyms to import');
      return 0;
    }
    
    // Batch insert
    const BATCH_SIZE = 100;
    let imported = 0;
    let skipped = 0;
    
    for (let i = 0; i < gymsArray.length; i += BATCH_SIZE) {
      const batch = gymsArray.slice(i, i + BATCH_SIZE);
      const values = [];
      const params = [];
      let paramIndex = 1;
      
      for (const gym of batch) {
        // Google gyms may have different structures
        const poiId = gym.id || gym.place_id || gym.provider_poi_id;
        const name = gym.name || (gym.displayName && gym.displayName.text) || null;
        const location = gym.location || (gym.geometry && gym.geometry.location) || gym.coordinates || null;
        
        if (!poiId || !name || !location) {
          skipped++;
          continue;
        }
        
        const lng = location.lng || location.lon || location[0] || null;
        const lat = location.lat || location[1] || null;
        
        if (!lng || !lat) {
          skipped++;
          continue;
        }
        
        // Google gyms: city/state will be NULL initially, enriched later via API
        const address = gym.address || gym.formatted_address || gym.formattedAddress || null;
        const countryCode = gym.country || gym.country_code || (gym.address_components ? extractCountryFromComponents(gym.address_components) : null) || null;
        
        values.push(`(
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
          $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
          ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography,
          $${paramIndex++}, $${paramIndex++}
        )`);
        
        params.push(
          'google',                                  // provider
          poiId,                                     // provider_poi_id
          name,                                      // name
          address,                                   // address
          null,                                      // city (will be enriched via API)
          null,                                      // state (will be enriched via API)
          countryCode,                              // country_code (if available)
          gym.phone || gym.formatted_phone_number || null,  // phone
          lng,                                       // longitude
          lat,                                       // latitude
          gym.image || (gym.photo && gym.photo.url) || gym.image_primary_url || null,  // image_primary_url
          JSON.stringify(gym)                        // raw
        );
      }
      
      if (values.length > 0) {
        const query = `
          INSERT INTO gyms (
            provider, provider_poi_id, name, address, city, state, country_code, phone, geom, image_primary_url, raw
          ) VALUES ${values.join(', ')}
          ON CONFLICT (provider, provider_poi_id) 
          DO UPDATE SET
            name = EXCLUDED.name,
            address = EXCLUDED.address,
            city = COALESCE(EXCLUDED.city, gyms.city),
            state = COALESCE(EXCLUDED.state, gyms.state),
            country_code = COALESCE(EXCLUDED.country_code, gyms.country_code),
            phone = EXCLUDED.phone,
            image_primary_url = EXCLUDED.image_primary_url,
            raw = EXCLUDED.raw,
            updated_at = now()
        `;
        
        await pool.query(query, params);
        imported += batch.length; // Count all (inserts + updates)
      }
      
      if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= gymsArray.length) {
        console.log(`  ✅ Processed ${imported}/${gymsArray.length} Google gyms...`);
      }
    }
    
    console.log(`\n✅ Imported ${imported} Google gyms (city/state will be enriched)`);
    console.log(`   Skipped: ${skipped} (missing required fields)\n`);
    return imported;
  } catch (error) {
    console.error(`❌ Error importing Google gyms: ${error.message}`);
    throw error;
  }
}

/**
 * Extract country code from address components
 */
function extractCountryFromComponents(components) {
  if (!Array.isArray(components)) return null;
  for (const comp of components) {
    if (comp.types && comp.types.includes('country')) {
      return comp.short_name || comp.short_name || null;
    }
  }
  return null;
}

/**
 * Enrich Google gyms with city/state using Google API
 */
async function enrichGoogleGyms(pool, apiKey, limit = null) {
  console.log('🌐 Step 3: Enriching Google gyms with city/state via API...\n');
  
  if (!apiKey) {
    console.warn('⚠️  Warning: GOOGLE_MAPS_API_KEY not set. Skipping enrichment.');
    console.warn('   Set GOOGLE_MAPS_API_KEY in .env to enable enrichment.\n');
    return 0;
  }
  
  // Load cache
  const geocodingCache = loadGeocodingCache();
  console.log(`  📦 Loaded ${Object.keys(geocodingCache).length} cached geocoding results\n`);
  
  // Get Google gyms missing city/state
  let query = `
    SELECT 
      id,
      provider_poi_id,
      name,
      address,
      city,
      state,
      country_code,
      raw,
      ST_X(ST_AsText(geom::geometry))::numeric as lng,
      ST_Y(ST_AsText(geom::geometry))::numeric as lat
    FROM gyms
    WHERE provider = 'google'
      AND geom IS NOT NULL
      AND (city IS NULL OR city = '' OR state IS NULL OR state = '')
    ORDER BY id
  `;
  
  const params = [];
  if (limit) {
    query += ` LIMIT $1`;
    params.push(limit);
  }
  
  const result = await pool.query(query, params);
  const gyms = result.rows;
  
  const limitMsg = limit ? ` (limited to ${limit})` : '';
  console.log(`  📊 Found ${gyms.length} Google gyms to enrich${limitMsg}`);
  
  if (gyms.length === 0) {
    console.log('  ✅ All Google gyms already have city/state data!\n');
    return 0;
  }
  
  let updated = 0;
  let fromCache = 0;
  let fromApi = 0;
  let errors = 0;
  
  // Process in parallel batches
  const PARALLEL_BATCH_SIZE = 5;
  const BATCH_DELAY = 100;
  
  for (let i = 0; i < gyms.length; i += PARALLEL_BATCH_SIZE) {
    const batch = gyms.slice(i, i + PARALLEL_BATCH_SIZE);
    
    const promises = batch.map(async (gym) => {
      try {
        // Check cache first
        let geoData = null;
        const cachedData = getCachedGeocoding(gym.id, geocodingCache);
        if (cachedData) {
          geoData = cachedData;
          fromCache++;
        } else {
          // Call Google API
          geoData = await geocodeLocation(gym.lat, gym.lng, gym.address, apiKey);
          if (geoData) {
            setCachedGeocoding(gym.id, geoData, geocodingCache);
            fromApi++;
          }
        }
        
        if (!geoData || (!geoData.city && !geoData.state)) {
          return false;
        }
        
        // Update database
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (geoData.city) {
          updates.push(`city = $${paramIndex++}`);
          values.push(geoData.city);
        }
        
        if (geoData.state) {
          updates.push(`state = $${paramIndex++}`);
          values.push(geoData.state);
        }
        
        if (geoData.country_code && (!gym.country_code || gym.country_code.trim() === '')) {
          updates.push(`country_code = $${paramIndex++}`);
          values.push(geoData.country_code);
        }
        
        if (updates.length > 0) {
          values.push(gym.id);
          await pool.query(`
            UPDATE gyms 
            SET ${updates.join(', ')}, updated_at = now()
            WHERE id = $${paramIndex}
          `, values);
          return true;
        }
        
        return false;
      } catch (error) {
        console.error(`Error enriching gym ${gym.id}:`, error.message);
        errors++;
        return false;
      }
    });
    
    const results = await Promise.all(promises);
    updated += results.filter(r => r === true).length;
    
    // Progress update
    if ((i + PARALLEL_BATCH_SIZE) % 50 === 0 || i + PARALLEL_BATCH_SIZE >= gyms.length) {
      console.log(`  [${Math.min(i + PARALLEL_BATCH_SIZE, gyms.length)}/${gyms.length}] Enriched ${updated} gyms...`);
    }
    
    // Save cache periodically
    if ((i + PARALLEL_BATCH_SIZE) % 200 === 0) {
      saveGeocodingCache(geocodingCache);
    }
    
    // Small delay between batches
    if (i + PARALLEL_BATCH_SIZE < gyms.length) {
      await sleep(BATCH_DELAY);
    }
  }
  
  // Final cache save
  saveGeocodingCache(geocodingCache);
  
  console.log(`\n✅ Enriched ${updated} Google gyms:`);
  console.log(`   - From cache: ${fromCache}`);
  console.log(`   - From API: ${fromApi}`);
  console.log(`   - Errors: ${errors}\n`);
  
  return updated;
}

async function main() {
  const skipImport = process.argv.includes('--skip-import');
  const enrich = process.argv.includes('--enrich');
  const limitArg = process.argv.find(arg => /^--limit=\d+$/.test(arg));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  console.log('🚀 Database Population Script\n');
  
  const pool = getLocalPool();
  try {
    // Verify connection
    const dbCheck = await pool.query('SELECT current_database() as db_name');
    console.log(`✅ Connected to LOCAL database: ${dbCheck.rows[0].db_name}\n`);
    
    if (!skipImport) {
      // Step 1: Import China gyms (with city/state from seed file)
      await importChinaGyms(pool);
      
      // Step 2: Import Google gyms (basic info, city/state will be NULL)
      await importGoogleGyms(pool);
    } else {
      console.log('⏭️  Skipping import (using --skip-import flag)\n');
    }
    
    if (enrich) {
      // Step 3: Enrich Google gyms with city/state via API
      await enrichGoogleGyms(pool, apiKey, limit);
    } else {
      console.log('ℹ️  Skipping enrichment (use --enrich flag to enable API calls)');
      console.log('   Google gyms will have NULL city/state until enriched.\n');
    }
    
    // Final statistics
    const stats = await pool.query(`
      SELECT 
        provider,
        COUNT(*) as total,
        COUNT(CASE WHEN city IS NOT NULL AND city != '' THEN 1 END) as with_city,
        COUNT(CASE WHEN state IS NOT NULL AND state != '' THEN 1 END) as with_state
      FROM gyms
      GROUP BY provider
      ORDER BY provider
    `);
    
    console.log('📊 Final Statistics by Provider:');
    stats.rows.forEach(row => {
      console.log(`  ${row.provider}: ${parseInt(row.total).toLocaleString()} gyms`);
      console.log(`    - With city: ${parseInt(row.with_city).toLocaleString()}`);
      console.log(`    - With state: ${parseInt(row.with_state).toLocaleString()}`);
    });
    
    console.log('\n✅ Population complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

