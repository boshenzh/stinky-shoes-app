/**
 * Enrich Local Database with City/State Data
 * 
 * This script enriches your LOCAL database with city/state information:
 * 1. For amap (China) provider: Loads city/state from data/seed/china_gyms.json (NO API calls)
 * 2. For google provider: 
 *    - First extracts from cached Google API results (from data/seed/geocoding_cache.json)
 *    - Then uses Google Geocoding API for remaining gyms and caches results to JSON file
 * 
 * IMPORTANT: 
 * - amap gyms use seed JSON file (china_gyms.json) - NO API calls needed
 * - google gyms use Google API as source of truth - Address string parsing is NOT used
 * - Cache is stored in data/seed/geocoding_cache.json for version control
 * 
 * Usage:
 *   node scripts/enrich_local_db.js                    # Extract from seed files and cache only (no API)
 *   node scripts/enrich_local_db.js --api              # Use Google API for remaining google provider gyms
 *   node scripts/enrich_local_db.js --api --limit=100  # Limit API calls to 100 gyms (saves API quota)
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

// Path to geocoding cache file
const CACHE_FILE = path.resolve(__dirname, '../data/seed/geocoding_cache.json');
// Path to China gyms seed file
const CHINA_GYMS_FILE = path.resolve(__dirname, '../data/seed/china_gyms.json');

/**
 * Load geocoding cache from JSON file
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
 * Save geocoding cache to JSON file
 */
function saveGeocodingCache(cache) {
  try {
    // Ensure directory exists
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
 * Load China gyms data from seed JSON file
 */
function loadChinaGyms() {
  if (!existsSync(CHINA_GYMS_FILE)) {
    console.warn(`⚠️  Warning: China gyms file not found: ${CHINA_GYMS_FILE}`);
    return {};
  }
  try {
    const data = readFileSync(CHINA_GYMS_FILE, 'utf8');
    const gyms = JSON.parse(data);
    
    // Convert to map by id (provider_poi_id) for fast lookup
    const gymsMap = {};
    if (Array.isArray(gyms)) {
      for (const gym of gyms) {
        if (gym.id) {
          gymsMap[gym.id] = gym;
        }
      }
    } else if (typeof gyms === 'object') {
      // If it's already an object with id keys
      for (const [id, gym] of Object.entries(gyms)) {
        if (gym.id || id) {
          gymsMap[gym.id || id] = gym;
        }
      }
    }
    
    return gymsMap;
  } catch (error) {
    console.warn(`⚠️  Warning: Could not load China gyms: ${error.message}`);
    return {};
  }
}

/**
 * Extract city/state from China gym data
 */
function extractFromChinaGym(chinaGym) {
  if (!chinaGym) return null;
  
  const city = chinaGym.city || null;
  const province = chinaGym.province || null; // Province is state for China
  
  if (city || province) {
    return {
      city,
      state: province, // Province maps to state field
      country_code: 'CN'
    };
  }
  
  return null;
}

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

/**
 * Sleep helper to rate limit API calls
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract city/state from raw JSON data and cache
 * Only uses cached data that was previously fetched from Google API
 */
function extractFromRawData(raw, gymId, cache) {
  if (!raw) return null;
  
  let city = null;
  let state = null;
  let countryCode = null;
  
  // PRIORITY 1: Check for cached city/state from JSON cache file (most reliable)
  const cachedData = getCachedGeocoding(gymId, cache);
  if (cachedData) {
    city = cachedData.city || null;
    state = cachedData.state || null;
    countryCode = cachedData.country_code || null;
  }
  
  // PRIORITY 2: Check if raw has addressComponents from Google Places API detailed format
  // This is also from Google API, so it's reliable
  if ((!city || !state) && (raw.addressComponents || (raw.details && raw.details.addressComponents) || (raw.result && raw.result.address_components))) {
    const addressComponents = raw.addressComponents || (raw.details && raw.details.addressComponents) || (raw.result && raw.result.address_components) || [];
    if (Array.isArray(addressComponents) && addressComponents.length > 0) {
      for (const component of addressComponents) {
        const types = component.types || [];
        if (Array.isArray(types)) {
          if (!city && (types.includes('locality') || types.includes('administrative_area_level_2'))) {
            city = component.longName || component.long_name || component.name || null;
          }
          if (!state && types.includes('administrative_area_level_1')) {
            state = component.shortName || component.short_name || component.longName || component.long_name || component.name || null;
          }
          if (!countryCode && types.includes('country')) {
            countryCode = component.shortName || component.short_name || null;
          }
        }
      }
    }
  }
  
  // Method 3: Check if country code is available
  if (!countryCode && raw.country) {
    countryCode = typeof raw.country === 'string' ? raw.country.toUpperCase() : raw.country;
  }
  
  // NOTE: We do NOT parse address strings - they are unreliable
  // Only use Google API results as source of truth
  
  if (city || state || countryCode) {
    return { city, state, country_code: countryCode };
  }
  
  return null;
}

/**
 * Geocode coordinates or address using Google Maps Geocoding API
 */
async function geocodeLocation(lat, lng, address, apiKey) {
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not set');
  }

  // Try geocoding by coordinates first (most accurate)
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

    // Parse address components
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

async function enrichLocalDatabase(pool, apiKey, limit = null, useApi = false) {
  console.log('📍 Enriching LOCAL database with city/state data...\n');
  
  // Load geocoding cache
  console.log('📦 Loading geocoding cache from JSON file...');
  const geocodingCache = loadGeocodingCache();
  const cacheSize = Object.keys(geocodingCache).length;
  console.log(`  ✅ Loaded ${cacheSize} cached geocoding results\n`);
  
  // Load China gyms data for amap provider
  console.log('📦 Loading China gyms data from seed JSON...');
  const chinaGyms = loadChinaGyms();
  const chinaGymsCount = Object.keys(chinaGyms).length;
  console.log(`  ✅ Loaded ${chinaGymsCount} China gyms from seed file\n`);
  
  // Verify we're connected to local database
  const dbCheck = await pool.query('SELECT current_database() as db_name');
  console.log(`✅ Connected to LOCAL database: ${dbCheck.rows[0].db_name}\n`);
  
  // Get gyms missing city/state data
  let query = `
    SELECT 
      id, 
      name,
      address,
      city,
      state,
      country_code,
      provider,
      raw,
      ST_X(ST_AsText(geom::geometry))::numeric as lng,
      ST_Y(ST_AsText(geom::geometry))::numeric as lat
    FROM gyms
    WHERE geom IS NOT NULL
      AND (city IS NULL OR city = '' OR state IS NULL OR state = '')
    ORDER BY 
      CASE WHEN provider = 'google' THEN 0 ELSE 1 END,
      id
  `;
  
  const params = [];
  if (limit) {
    query += ` LIMIT $1`;
    params.push(limit);
  }
  
  const result = await pool.query(query, params);

  console.log(`📊 Found ${result.rows.length} gyms missing city/state data...\n`);
  if (result.rows.length === 0) {
    console.log('✅ All gyms already have city/state data!');
    return;
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let fromRaw = 0;
  let fromChina = 0;
  let fromApi = 0;

  // Phase 1: Extract from cache, China gyms seed file, and raw data (fast, no API calls)
  console.log('📦 Phase 1: Extracting from seed files, cache, and raw JSON data...');
  const rawExtractionResults = [];
  for (let i = 0; i < result.rows.length; i++) {
    const gym = result.rows[i];
    
    let geoData = null;
    
    // PRIORITY 1: For amap provider, load from China gyms seed file
    if (gym.provider === 'amap' && gym.provider_poi_id && chinaGyms[gym.provider_poi_id]) {
      geoData = extractFromChinaGym(chinaGyms[gym.provider_poi_id]);
      if (geoData && (geoData.city || geoData.state)) {
        rawExtractionResults.push({ gym, geoData, source: 'china_seed' });
      }
    }
    
    // PRIORITY 2: Extract from raw data (for Google provider)
    if (!geoData && gym.raw) {
      geoData = extractFromRawData(gym.raw, gym.id, geocodingCache);
      if (geoData && (geoData.city || geoData.state)) {
        rawExtractionResults.push({ gym, geoData, source: 'raw' });
      }
    }
    
    if (i > 0 && i % 1000 === 0) {
      console.log(`  Processed ${i}/${result.rows.length} gyms for extraction...`);
    }
  }
  
  // Separate counts for clarity
  const fromChinaSeedCount = rawExtractionResults.filter(r => r.source === 'china_seed').length;
  const fromRawDataCount = rawExtractionResults.filter(r => r.source === 'raw').length;
  console.log(`  ✅ Extracted ${rawExtractionResults.length} gyms:`);
  console.log(`     - From China seed file (amap): ${fromChinaSeedCount}`);
  console.log(`     - From cache/raw data (google): ${fromRawDataCount}`);
  
  // Update gyms from extractions
  if (rawExtractionResults.length > 0) {
    console.log('  💾 Updating LOCAL database with extractions...');
    
    for (const { gym, geoData, source } of rawExtractionResults) {
      try {
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
          const updateQuery = `
            UPDATE gyms 
            SET ${updates.join(', ')}, updated_at = now()
            WHERE id = $${paramIndex}
          `;
          await pool.query(updateQuery, values);
          updated++;
          
          if (source === 'china_seed') {
            fromChina++;
          } else {
            fromRaw++;
          }
        }
      } catch (error) {
        console.error(`Error updating gym ${gym.id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`  ✅ Updated ${updated} gyms:`);
    console.log(`    - From China seed file: ${fromChina}`);
    console.log(`    - From cache/raw data: ${fromRaw}\n`);
  }
  
  // Phase 2: Use API for remaining gyms (if enabled)
  // NOTE: amap provider gyms should NOT use API - they should use China seed file
  if (useApi && apiKey) {
    console.log('🌐 Phase 2: Geocoding remaining gyms via Google Geocoding API...');
    console.log('  ℹ️  Note: amap provider gyms use seed file (no API calls)\n');
    
    // Re-fetch to get updated city/state values, including raw data
    // Only get Google provider gyms (not amap, not China)
    let remainingQuery = `
      SELECT 
        id, 
        name,
        address,
        city,
        state,
        country_code,
        provider,
        raw,
        ST_X(ST_AsText(geom::geometry))::numeric as lng,
        ST_Y(ST_AsText(geom::geometry))::numeric as lat
      FROM gyms
      WHERE geom IS NOT NULL
        AND (city IS NULL OR city = '' OR state IS NULL OR state = '')
        AND provider = 'google'
        AND country_code != 'CN'
      ORDER BY id
    `;
    
    // Apply limit if specified (for API calls only)
    const remainingParams = [];
    if (limit) {
      remainingQuery += ` LIMIT $1`;
      remainingParams.push(limit);
    }
    
    const remainingResult = await pool.query(remainingQuery, remainingParams);
    const remainingGyms = remainingResult.rows;
    
    const limitMsg = limit ? ` (limited to ${limit})` : '';
    console.log(`  Found ${remainingGyms.length} gyms to geocode via API${limitMsg}`);
    
    if (remainingGyms.length > 0) {
      // Process in parallel batches (faster)
      const PARALLEL_BATCH_SIZE = 5; // 5 parallel requests
      const BATCH_DELAY = 100; // 100ms between batches
      
      for (let i = 0; i < remainingGyms.length; i += PARALLEL_BATCH_SIZE) {
        const batch = remainingGyms.slice(i, i + PARALLEL_BATCH_SIZE);
        
        // Process batch in parallel
        const promises = batch.map(async (gym) => {
          try {
            // Check cache first (from JSON file)
            let geoData = null;
            const cachedData = getCachedGeocoding(gym.id, geocodingCache);
            if (cachedData) {
              geoData = cachedData;
            } else {
              // Call Google API
              geoData = await geocodeLocation(gym.lat, gym.lng, gym.address, apiKey);
              
              // If API call succeeded, cache the result in JSON file
              if (geoData) {
                setCachedGeocoding(gym.id, geoData, geocodingCache);
              }
            }
            
            if (!geoData || (!geoData.city && !geoData.state)) {
              return { gym, success: false };
            }

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
              const updateQuery = `
                UPDATE gyms 
                SET ${updates.join(', ')}, updated_at = now()
                WHERE id = $${paramIndex}
              `;
              await pool.query(updateQuery, values);
              return { gym, success: true, geoData };
            }
            
            return { gym, success: false };
          } catch (error) {
            console.error(`Error processing gym ${gym.id}:`, error.message);
            return { gym, success: false, error };
          }
        });
        
        const results = await Promise.all(promises);
        
        for (const result of results) {
          if (result.success) {
            updated++;
            fromApi++;
          } else {
            skipped++;
          }
        }
        
        // Progress update
        if (fromApi % 50 === 0 && fromApi > 0) {
          console.log(`  [${i + results.length}/${remainingGyms.length}] Updated ${fromApi} gyms via API...`);
        }
        
        // Small delay between batches to respect rate limits
        if (i + PARALLEL_BATCH_SIZE < remainingGyms.length) {
          await sleep(BATCH_DELAY);
        }
      }
      
      // Save cache after processing all gyms
      console.log('  💾 Saving geocoding cache to JSON file...');
      saveGeocodingCache(geocodingCache);
      console.log(`  ✅ Updated ${fromApi} gyms via API\n`);
    }
  } else {
    skipped = result.rows.length - updated;
  }

  // Final summary
  console.log(`✅ Enrichment complete:`);
  console.log(`  Total updated: ${updated}`);
  console.log(`    - From China seed file: ${fromChina}`);
  console.log(`    - From cache/raw data: ${fromRaw}`);
  console.log(`    - From API: ${fromApi}`);
  console.log(`  Skipped: ${skipped} (no data found or already complete)`);
  console.log(`  Errors: ${errors}`);
  
  // Show current stats
  const finalStats = await pool.query(`
    SELECT 
      COUNT(*) as total_gyms,
      COUNT(CASE WHEN city IS NOT NULL AND city != '' THEN 1 END) as gyms_with_city,
      COUNT(CASE WHEN state IS NOT NULL AND state != '' THEN 1 END) as gyms_with_state,
      COUNT(CASE WHEN city IS NOT NULL AND city != '' AND state IS NOT NULL AND state != '' THEN 1 END) as gyms_with_both
    FROM gyms
  `);
  const stats = finalStats.rows[0];
  console.log(`\n📊 LOCAL Database Statistics:`);
  console.log(`  Total gyms: ${stats.total_gyms}`);
  console.log(`  With city: ${stats.gyms_with_city} (${((stats.gyms_with_city / stats.total_gyms) * 100).toFixed(1)}%)`);
  console.log(`  With state: ${stats.gyms_with_state} (${((stats.gyms_with_state / stats.total_gyms) * 100).toFixed(1)}%)`);
  console.log(`  With both: ${stats.gyms_with_both} (${((stats.gyms_with_both / stats.total_gyms) * 100).toFixed(1)}%)`);
}

async function main() {
  // Default to extracting from raw data (no API needed)
  // Use --api flag to enable Google Geocoding API calls
  const useApi = process.argv.includes('--api');
  
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (useApi && !apiKey) {
    console.error('❌ Error: GOOGLE_MAPS_API_KEY not set in environment variables');
    console.error('   Please set GOOGLE_MAPS_API_KEY in your .env file');
    console.error('   Or run without --api flag to extract from raw JSON data only');
    process.exit(1);
  }

  // Default to no limit (process all gyms) or use --limit=N
  const limitArg = process.argv.find(arg => /^--limit=\d+$/.test(arg));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

  if (useApi) {
    console.log('🌐 Mode: Google Geocoding API enabled (will make API calls)\n');
  } else {
    console.log('📦 Mode: Extract from raw JSON data only (no API calls)\n');
  }

  const pool = getLocalPool();
  try {
    await enrichLocalDatabase(pool, apiKey, limit, useApi);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

