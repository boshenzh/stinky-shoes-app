import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error('Missing GOOGLE_MAPS_API_KEY in environment. Create a .env file with GOOGLE_MAPS_API_KEY=your_key');
  process.exit(1);
}

const OUTPUT_PATH = path.resolve(__dirname, '../public/world_gyms_google.json');

const KEYWORDS = [
  'climbing gym',
  'bouldering gym',
  'rock climbing gym',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function inChina(lat, lng) {
  // Rough China bbox: 18..54N, 73..135E
  return lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135;
}

function* worldGrid(step = 5) {
  for (let lat = -60; lat < 75; lat += step) {
    for (let lng = -180; lng < 180; lng += step) {
      const low = { latitude: lat, longitude: lng };
      const high = { latitude: Math.min(lat + step, 85), longitude: Math.min(lng + step, 180) };
      const centerLat = (low.latitude + high.latitude) / 2;
      const centerLng = (low.longitude + high.longitude) / 2;
      if (inChina(centerLat, centerLng)) continue; // skip China
      yield { low, high };
    }
  }
}

async function textSearch(textQuery, rectangle) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const body = {
    textQuery,
    maxResultCount: 20,
    locationBias: { rectangle },
  };
  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': GOOGLE_API_KEY,
    'X-Goog-FieldMask': [
      'places.id',
      'places.name',
      'places.displayName',
      'places.formattedAddress',
      'places.location',
      'places.types',
      'places.rating',
      'places.userRatingCount',
      'places.nationalPhoneNumber',
      'places.internationalPhoneNumber',
      'places.websiteUri',
      'places.photos',
    ].join(','),
  };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google places: HTTP ${res.status} ${text}`);
  }
  const data = await res.json();
  return Array.isArray(data.places) ? data.places : [];
}

function normalizePlace(p) {
  const id = p.id || p.name || null;
  const name = p.displayName?.text || null;
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  return {
    id,
    name,
    location: (typeof lat === 'number' && typeof lng === 'number') ? { lat, lng } : undefined,
    address: p.formattedAddress || null,
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
    website: p.websiteUri || null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    types: p.types || [],
    source: 'google',
  };
}

function nameLooksLikeGym(name) {
  if (!name) return false;
  const s = name.toLowerCase();
  return s.includes('climb') || s.includes('boulder') || s.includes('rock');
}

async function main() {
  console.log('Fetching climbing gyms worldwide (excluding China) via Google Places Text Search…');
  const seen = new Map();
  let cells = 0; let hits = 0;
  for (const rect of worldGrid(5)) {
    cells += 1;
    for (const kw of KEYWORDS) {
      try {
        const places = await textSearch(kw, { low: rect.low, high: rect.high });
        for (const p of places) {
          const n = normalizePlace(p);
          if (!n.id) continue;
          // keep if name hints at climbing or Google returned it for climbing terms
          if (!nameLooksLikeGym(n.name)) continue;
          if (!seen.has(n.id)) { seen.set(n.id, n); hits += 1; }
        }
      } catch (e) {
        // log and continue
        console.warn('Search error', kw, rect.low, '->', rect.high, (e && e.message) || e);
      }
      await sleep(150); // polite pacing
    }
    // periodic save
    if (cells % 50 === 0) {
      console.log(`Cells processed: ${cells}, gyms collected: ${hits}`);
    }
  }

  const records = Array.from(seen.values());
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(records, null, 2), 'utf8');
  console.log(`Saved ${records.length} gyms to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });


