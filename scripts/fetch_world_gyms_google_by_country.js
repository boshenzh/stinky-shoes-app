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

// Tweakable: country list (ISO-3166-1 alpha-2). Excludes CN.
const COUNTRY_CODES = (
  process.env.COUNTRIES?.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) || [
    'US','CA','MX','BR','AR','CL','CO','PE',
    'GB','IE','FR','DE','ES','IT','PT','NL','BE','CH','AT','PL','CZ','SE','NO','DK','FI',
    'AU','NZ','JP','KR','SG','MY','TH','VN','ID','PH','IN','AE','TR','IL','EG','ZA'
  ]
).filter(c => c !== 'CN');

const KEYWORDS = ['climbing'];
// Localized keywords to improve recall per country
const COUNTRY_KEYWORDS = {
  JP: ['クライミング', 'ボルダリング', 'climbing'],
  KR: ['클라이밍', '볼더링', 'climbing'],
  FR: ['escalade', 'climbing'],
  DE: ['klettern', 'bouldern', 'climbing'],
  ES: ['escalada', 'climbing'],
  PT: ['escalada', 'climbing'],
  IT: ['arrampicata', 'climbing']
};
// Country -> language hint
const COUNTRY_LANGUAGE = { JP: 'ja', KR: 'ko', FR: 'fr', DE: 'de', ES: 'es', PT: 'pt', IT: 'it' };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function textSearch({ textQuery, regionCode, pageToken }) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const body = {
    textQuery,
    regionCode, // prefer country-based bias
    maxResultCount: 20,
  };
  if (pageToken) body.pageToken = pageToken;
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
      'places.websiteUri'
    ].join(','),
  };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google places: HTTP ${res.status} ${text}`);
  }
  const data = await res.json();
  return {
    places: Array.isArray(data.places) ? data.places : [],
    nextPageToken: data.nextPageToken || null
  };
}

// No post-filtering; we will rely on Nearby Search includedTypes+keyword

async function nearbySearch({ center, radiusMeters = 10000, includedTypes = ['gym'], keyword = 'climbing', languageCode, pageToken }) {
  const url = 'https://places.googleapis.com/v1/places:searchNearby';
  const body = {
    includedTypes,
    maxResultCount: 20,
    locationRestriction: { circle: { center, radius: radiusMeters } },
    keyword,
    ...(languageCode ? { languageCode } : {}),
    ...(pageToken ? { pageToken } : {}),
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
      'places.userRatingCount'
    ].join(','),
  };
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google nearby: HTTP ${res.status} ${text}`);
  }
  const data = await res.json();
  return {
    places: Array.isArray(data.places) ? data.places : [],
    nextPageToken: data.nextPageToken || null
  };
}

function normalizePlace(p, country) {
  const id = p.id || p.name || null;
  const name = p.displayName?.text || null;
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  return {
    id,
    source: 'google',
    country,
    name,
    location: (typeof lat === 'number' && typeof lng === 'number') ? { lat, lng } : undefined,
    address: p.formattedAddress || null,
    phone: p.nationalPhoneNumber || null,
    website: p.websiteUri || null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    types: p.types || []
  };
}

async function collectForCountry(code, seen) {
  let collected = 0; let queries = 0;
  // Use Nearby Search around seeds only (localized keywords + radius escalation + paging)
  try {
    const seedsPath = path.resolve(__dirname, 'country_seeds.json');
    const raw = await fs.readFile(seedsPath, 'utf8').catch(() => '');
    const seedsMap = raw ? JSON.parse(raw) : {};
    const seeds = Array.isArray(seedsMap?.[code]) ? seedsMap[code] : [];
    const kws = COUNTRY_KEYWORDS[code] || KEYWORDS;
    const lang = COUNTRY_LANGUAGE[code];
    for (const s of seeds) {
      const center = { latitude: s.lat, longitude: s.lng };
      const radii = [s.radius || 10000, 20000, 40000, 50000];
      for (const kw of kws) {
        for (const r of radii) {
          try {
            // First page
            queries += 1;
            let { places, nextPageToken } = await nearbySearch({ center, radiusMeters: r, keyword: kw, languageCode: lang });
            for (const p of places) {
              const id = p.id || p.name; if (!id) continue;
              if (!seen.has(id)) { seen.set(id, normalizePlace(p, code)); collected += 1; }
            }
            await sleep(200);
            // Page 2..3
            let pages = 1;
            while (nextPageToken && pages < 3) {
              queries += 1; pages += 1;
              const res = await nearbySearch({ center, radiusMeters: r, keyword: kw, languageCode: lang, pageToken: nextPageToken });
              places = res.places; nextPageToken = res.nextPageToken;
              for (const p of places) {
                const id = p.id || p.name; if (!id) continue;
                if (!seen.has(id)) { seen.set(id, normalizePlace(p, code)); collected += 1; }
              }
              await sleep(200);
            }
            // If this radius+kw returned enough, skip larger radius for this kw
            if ((places?.length || 0) >= 5) break;
          } catch (e) {
            // move to next radius/keyword
          }
        }
      }
    }
  } catch (_) {}
  return { collected, queries };
}

async function main() {
  console.log(`Fetching climbing gyms via Google Places by country. Countries=${COUNTRY_CODES.length}`);
  const seen = new Map();
  let total = 0; let idx = 0;
  for (const code of COUNTRY_CODES) {
    idx += 1;
    console.log(`[${idx}/${COUNTRY_CODES.length}] ${code} …`);
    try {
      const { collected } = await collectForCountry(code, seen);
      total += collected;
      console.log(`  +${collected} (total ${total})`);
    } catch (e) {
      console.warn(`  ${code} error:`, (e && e.message) || e);
    }
    await sleep(300);
  }

  const records = Array.from(seen.values());
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(records, null, 2), 'utf8');
  console.log(`Saved ${records.length} gyms to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });


