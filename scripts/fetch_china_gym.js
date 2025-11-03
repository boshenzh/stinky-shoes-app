// fetch all the climbing gyms in China, iterate over all cities, store data in a JSON.
// Filter out places that do not contain 攀岩/climbing/boulder/climb/抱石 in the name.

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AMAP_KEY = process.env.AMAP_KEY || process.env.AMAP_API_KEY;
if (!AMAP_KEY) {
  console.error('Missing AMAP_KEY in environment. Create a .env file with AMAP_KEY=your_key');
  process.exit(1);
}

const OUTPUT_PATH = path.resolve(__dirname, '../public/china_gyms.json').replace(/scripts\/\.\./, '');

const KEYWORDS = ['攀岩', '抱石', 'climbing', 'boulder', 'climb'];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nameMatches(name) {
  if (!name) return false;
  const lower = String(name).toLowerCase();
  return KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function fetchAllCities() {
  // Use AMap District API to get all cities under China
  const url = `https://restapi.amap.com/v3/config/district?key=${AMAP_KEY}&keywords=%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD&level=country&subdistrict=2&extensions=base&output=JSON`;
  const data = await fetchJson(url);
  if (data.status !== '1' || !Array.isArray(data.districts)) {
    console.error('AMap district API error:', { info: data.info, infocode: data.infocode });
    throw new Error('Failed to fetch districts from AMap');
  }

  const country = data.districts[0];
  const provinces = country?.districts || [];
  const cities = [];

  for (const prov of provinces) {
    const sub = prov?.districts || [];
    // Prefer level=city under each province; if none, use the province itself (for municipalities)
    const cityLevel = sub.filter(d => d.level === 'city');
    if (cityLevel.length > 0) {
      for (const c of cityLevel) {
        cities.push({ name: c.name, adcode: c.adcode, province: prov.name });
      }
    } else {
      // Municipality like 北京市: treat province as a city
      cities.push({ name: prov.name, adcode: prov.adcode, province: prov.name });
    }
  }

  return cities;
}

async function fetchPoisForCity(cityAdcode) {
  const uniqueById = new Map();
  for (const kw of KEYWORDS) {
    let page = 1;
    while (true) {
      const url = new URL('https://restapi.amap.com/v5/place/text');
      url.searchParams.set('key', AMAP_KEY);
      url.searchParams.set('keywords', kw);
      url.searchParams.set('city', cityAdcode);
      url.searchParams.set('citylimit', 'true');
      url.searchParams.set('page_size', '25');
      url.searchParams.set('page_num', String(page));
      url.searchParams.set('output', 'JSON');
      url.searchParams.set('show_fields', 'photos'); // request photos in v5

      const data = await fetchJson(url.toString());
      if (data.status !== '1') {
        throw new Error(`AMap v5 place/text failed for adcode=${cityAdcode} kw=${kw} info=${data.info || ''} code=${data.infocode || ''}`);
      }

      const pois = Array.isArray(data.pois) ? data.pois : [];
      for (const poi of pois) {
        if (!nameMatches(poi.name)) continue;
        if (!poi.id) continue;
        uniqueById.set(poi.id, poi);
      }

      if (pois.length < 25 || page >= 100) {
        break;
      }
      page += 1;
      await sleep(150); // be gentle to the API
    }
    await sleep(200);
  }
  return Array.from(uniqueById.values());
}

function normalizePoi(poi) {
  const [lngStr, latStr] = (poi.location || '').split(',');
  const lng = lngStr ? Number(lngStr) : undefined;
  const lat = latStr ? Number(latStr) : undefined;
  const photos = Array.isArray(poi.photos) ? poi.photos : [];
  const imageUrls = photos
    .map(p => (p && (p.url || p.photo)) || '')
    .filter(Boolean);
  return {
    id: poi.id,
    name: poi.name,
    location: lng != null && lat != null ? { lng, lat } : undefined,
    province: poi.pname || undefined,
    city: poi.cityname || undefined,
    district: poi.adname || undefined,
    address: poi.address || undefined,
    tel: poi.tel || undefined,
    type: poi.type || undefined,
    image: imageUrls[0] || undefined,
    images: imageUrls.length ? imageUrls : undefined
  };
}

async function writeOutput(records) {
  const outDir = path.resolve(__dirname, '../public');
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'china_gyms.json'), JSON.stringify(records, null, 2), 'utf8');
}

async function main() {
  console.log('Fetching city list from AMap...');
  const cities = await fetchAllCities();
  console.log(`Found ${cities.length} cities`);

  const results = [];
  for (let i = 0; i < cities.length; i += 1) {
    const c = cities[i];
    console.log(`[${i + 1}/${cities.length}] Fetching POIs for ${c.name}`);
    try {
      const pois = await fetchPoisForCity(c.adcode);
      const normalized = pois.map(normalizePoi);
      results.push(...normalized);
      console.log(`  +${normalized.length} gyms so far: ${results.length}`);
    } catch (err) {
      console.error(`  Error fetching ${c.name}:`, err.message || err);
    }
    await sleep(250);
  }

  // Deduplicate by id
  const unique = Array.from(new Map(results.map(r => [r.id, r])).values());
  console.log(`Total unique gyms: ${unique.length}`);

  await writeOutput(unique);
  console.log('Saved to public/china_gyms.json');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
