import 'dotenv/config';
import { Pool } from 'pg';

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return new Pool({ connectionString, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
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
 * Sleep helper to rate limit API calls
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Geocode coordinates or address using Google Maps Geocoding API
 * Returns city and state/province information
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
    // Fallback to address geocoding
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
      console.error(`Geocoding API status: ${data.status}`);
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
      
      // Get city (locality or administrative_area_level_2)
      if (!city && (types.includes('locality') || types.includes('administrative_area_level_2'))) {
        city = component.long_name;
      }
      
      // Get state/province (administrative_area_level_1)
      if (!state && types.includes('administrative_area_level_1')) {
        state = component.short_name || component.long_name;
      }
      
      // Get country code
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

async function enrichGymLocations(pool, apiKey, limit = 100, batchSize = 10) {
  console.log('Enriching Google Maps gym location data with Google Maps Geocoding API...\n');
  
  // Get Google Maps gyms (non-China) for enrichment (will substitute city/state if geocoded data available)
  let query = `
    SELECT 
      id, 
      name,
      address,
      city,
      state,
      country_code,
      provider,
      ST_X(ST_AsText(geom::geometry))::numeric as lng,
      ST_Y(ST_AsText(geom::geometry))::numeric as lat
    FROM gyms
    WHERE geom IS NOT NULL
      AND provider = 'google'
      AND country_code != 'CN'
    ORDER BY id
  `;
  
  const params = [];
  if (limit) {
    query += ` LIMIT $1`;
    params.push(limit);
  }
  
  const result = await pool.query(query, params);

  console.log(`Found ${result.rows.length} gyms to enrich...\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < result.rows.length; i++) {
    const gym = result.rows[i];
    
    // Rate limiting: wait between batches
    if (i > 0 && i % batchSize === 0) {
      console.log(`Processed ${i} gyms, pausing for rate limit...`);
      await sleep(1000); // 1 second pause every 10 requests
    }

    try {
      const geoData = await geocodeLocation(gym.lat, gym.lng, gym.address, apiKey);
      
      if (!geoData) {
        skipped++;
        continue;
      }

      // Build update query - substitute fields if geocoded data is available
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
        // Only update country_code if it's missing (don't overwrite existing)
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
        
        if (updated % 10 === 0) {
          console.log(`Updated ${updated} gyms...`);
        }
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`Error processing gym ${gym.id} (${gym.name}):`, error.message);
      errors++;
    }
  }

  console.log(`\nEnrichment complete:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped} (no data found or already complete)`);
  console.log(`  Errors: ${errors}`);
}

async function main() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('Error: GOOGLE_MAPS_API_KEY not set in environment variables');
    console.error('Please set GOOGLE_MAPS_API_KEY in your .env file');
    process.exit(1);
  }

  // Default to no limit (process all gyms) or use command-line argument
  const limit = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  const batchSize = 10;

  const pool = getPool();
  try {
    await enrichGymLocations(pool, apiKey, limit, batchSize);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

