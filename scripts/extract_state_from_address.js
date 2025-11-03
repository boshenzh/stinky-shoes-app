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
 * Extract state/province/prefecture from address string
 * Examples:
 * - "880 Hampshire Rd, Westlake Village, CA 91361, USA" -> "CA"
 * - "8QFG+JCQ, Yên Định, Sơn Động, Bắc Giang, Vietnam" -> "Bắc Giang"
 * - "123 Main St, New York, NY 10001, USA" -> "NY"
 */
function extractStateFromAddress(address, countryCode) {
  if (!address || typeof address !== 'string') return null;
  
  const addr = address.trim();
  if (!addr) return null;
  
  // US addresses: Look for state abbreviation before zip code (2-3 letter state code, 5 digit zip)
  // Pattern: ", STATE ZIPCODE, Country" or ", STATE ZIPCODE, USA"
  if (countryCode === 'US' || countryCode === 'USA') {
    // Match: , CA 91361 or , NY 10001 or , CA  91361 (with spaces)
    const usPattern = /,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*,?\s*(?:USA|United States)?$/i;
    const match = addr.match(usPattern);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
    // Also try: "City, State" pattern (common in US)
    const cityStatePattern = /,\s*([A-Z]{2})(?:\s+\d{5})?\s*$/i;
    const cityMatch = addr.match(cityStatePattern);
    if (cityMatch && cityMatch[1]) {
      return cityMatch[1].toUpperCase();
    }
  }
  
  // Vietnamese addresses: Usually format "..., District, Province, Country"
  // Example: "Yên Định, Sơn Động, Bắc Giang, Vietnam"
  if (countryCode === 'VN' || countryCode === 'Vietnam') {
    // Split by comma and reverse to get parts
    const parts = addr.split(',').map(p => p.trim()).filter(p => p);
    if (parts.length >= 3) {
      // Last is country, second to last is province
      const province = parts[parts.length - 2];
      // Vietnamese provinces are usually 1-3 words
      if (province && province.length > 2 && !/^\d+$/.test(province)) {
        return province;
      }
    }
  }
  
  // Generic approach: Look for penultimate comma-separated segment before country
  // This works for many countries with "Address, City, State/Province, Country" format
  const parts = addr.split(',').map(p => p.trim()).filter(p => p);
  if (parts.length >= 3) {
    // Second to last part is likely state/province
    const potentialState = parts[parts.length - 2];
    // Filter out obvious non-states (zip codes, small numbers, very long strings)
    if (potentialState && 
        potentialState.length > 1 && 
        potentialState.length < 50 && 
        !/^\d+$/.test(potentialState) &&
        !/^\d{5,}$/.test(potentialState)) {
      return potentialState;
    }
  }
  
  // For Canada: Look for province abbreviations (AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT)
  if (countryCode === 'CA' || countryCode === 'Canada') {
    const canadaProvinces = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
    const parts = addr.split(',').map(p => p.trim());
    for (const part of parts) {
      if (canadaProvinces.includes(part.toUpperCase())) {
        return part.toUpperCase();
      }
    }
  }
  
  // For Australia: Look for state abbreviations (NSW, VIC, QLD, SA, WA, TAS, NT, ACT)
  if (countryCode === 'AU' || countryCode === 'Australia') {
    const ausStates = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];
    const parts = addr.split(',').map(p => p.trim());
    for (const part of parts) {
      if (ausStates.includes(part.toUpperCase())) {
        return part.toUpperCase();
      }
    }
  }
  
  return null;
}

async function addStateColumn(pool) {
  console.log('Adding state column to gyms table...');
  await pool.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gyms' AND column_name = 'state') THEN
        ALTER TABLE gyms ADD COLUMN state text;
        CREATE INDEX IF NOT EXISTS gyms_state_idx ON gyms(state);
        CREATE INDEX IF NOT EXISTS gyms_city_state_country_idx ON gyms(city, state, country_code);
      END IF;
    END $$;
  `);
  console.log('State column added (if it didn\'t exist).');
}

async function extractAndUpdateStates(pool) {
  console.log('Extracting states from addresses...');
  
  // First, try to extract from raw JSON for China gyms (province field)
  console.log('Checking raw JSON for province data (China gyms)...');
  const chinaGyms = await pool.query(`
    SELECT id, raw, state
    FROM gyms
    WHERE country_code = 'CN'
      AND (state IS NULL OR state = '')
      AND raw IS NOT NULL
    LIMIT 10000
  `);
  
  let updatedFromRaw = 0;
  for (const gym of chinaGyms.rows) {
    try {
      if (gym.raw && typeof gym.raw === 'object' && gym.raw.province) {
        const province = gym.raw.province;
        if (province && typeof province === 'string' && province.trim()) {
          await pool.query(
            'UPDATE gyms SET state = $1, updated_at = now() WHERE id = $2',
            [province.trim(), gym.id]
          );
          updatedFromRaw++;
          if (updatedFromRaw % 100 === 0) {
            console.log(`Updated ${updatedFromRaw} China gyms from raw JSON...`);
          }
        }
      }
    } catch (error) {
      console.error(`Error processing gym ${gym.id}:`, error.message);
    }
  }
  console.log(`Updated ${updatedFromRaw} China gyms from raw JSON.\n`);
  
  // Get all gyms with addresses but no state
  const result = await pool.query(`
    SELECT id, address, city, country_code, state
    FROM gyms
    WHERE address IS NOT NULL 
      AND address != ''
      AND (state IS NULL OR state = '')
      AND country_code IS NOT NULL
    ORDER BY id
  `);
  
  console.log(`Found ${result.rows.length} gyms to process...`);
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const gym of result.rows) {
    try {
      const extractedState = extractStateFromAddress(gym.address, gym.country_code);
      
      if (extractedState && extractedState !== gym.state) {
        await pool.query(
          'UPDATE gyms SET state = $1, updated_at = now() WHERE id = $2',
          [extractedState, gym.id]
        );
        updated++;
        
        if (updated % 100 === 0) {
          console.log(`Updated ${updated} gyms...`);
        }
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`Error processing gym ${gym.id}:`, error.message);
      errors++;
    }
  }
  
  console.log(`\nExtraction complete:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped} (could not extract or already set)`);
  console.log(`  Errors: ${errors}`);
}

async function main() {
  const pool = getPool();
  try {
    await addStateColumn(pool);
    await extractAndUpdateStates(pool);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
