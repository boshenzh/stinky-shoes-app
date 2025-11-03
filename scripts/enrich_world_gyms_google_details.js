import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error('Missing GOOGLE_MAPS_API_KEY in environment. Create a .env file with GOOGLE_MAPS_API_KEY=your_key');
  process.exit(1);
}

const INPUT_PATH = path.resolve('public/world_gyms_google.json');
const OUTPUT_PATH = path.resolve('public/world_gyms_google_detailed.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractPlaceId(rec) {
  if (!rec) return null;
  if (rec.id && typeof rec.id === 'string') return rec.id; // often the placeId
  if (rec.name && typeof rec.name === 'string') {
    // resource name format: "places/{placeId}"
    const m = rec.name.match(/places\/(.+)$/);
    if (m) return m[1];
  }
  return null;
}

async function fetchPlaceDetails(placeId, languageCode) {
  const idOrName = placeId.startsWith('places/') ? placeId : `places/${placeId}`;
  const url = `https://places.googleapis.com/v1/${idOrName}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': GOOGLE_API_KEY,
    'X-Goog-FieldMask': [
      'id',
      'displayName',
      'primaryType',
      'types',
      'formattedAddress',
      'nationalPhoneNumber',
      'internationalPhoneNumber',
      'websiteUri',
      'rating',
      'userRatingCount',
      'currentOpeningHours',
      'businessStatus',
      'photos'
    ].join(','),
    ...(languageCode ? { 'X-Goog-Visitor-Id': languageCode } : {}),
  };
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Place Details HTTP ${res.status} for ${placeId}: ${text.slice(0,200)}`);
  }
  return res.json();
}

async function withRetry(fn, { retries = 3, initialDelay = 500 } = {}) {
  let attempt = 0; let delay = initialDelay;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { return await fn(); } catch (e) {
      attempt += 1;
      if (attempt > retries) throw e;
      await sleep(delay);
      delay = Math.min(delay * 2, 5000);
    }
  }
}

async function main() {
  const raw = await fs.readFile(INPUT_PATH, 'utf8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr) || arr.length === 0) {
    console.log('No input gyms found at', INPUT_PATH);
    await fs.writeFile(OUTPUT_PATH, '[]', 'utf8');
    return;
  }

  const out = [];
  const concurrency = Number(process.env.DETAILS_CONCURRENCY || 5);
  let idx = 0;
  async function worker(chunk) {
    for (const rec of chunk) {
      idx += 1;
      const placeId = extractPlaceId(rec);
      if (!placeId) { out.push({ ...rec, details: null }); continue; }
      try {
        const details = await withRetry(() => fetchPlaceDetails(placeId));
        out.push({ ...rec, details });
      } catch (e) {
        out.push({ ...rec, details: { error: String(e.message || e) } });
      }
      if (idx % 25 === 0) {
        console.log(`Processed ${idx}/${arr.length}`);
      }
      await sleep(100);
    }
  }

  // Split work into N chunks
  const chunks = Array.from({ length: concurrency }, () => []);
  for (let i = 0; i < arr.length; i += 1) chunks[i % concurrency].push(arr[i]);
  await Promise.all(chunks.map(worker));

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Saved ${out.length} detailed gyms to ${OUTPUT_PATH}`);
}

main().catch((e) => { console.error(e); process.exit(1); });







