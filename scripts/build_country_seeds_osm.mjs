import fs from 'fs/promises';
import path from 'path';

const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

const DEFAULT_COUNTRIES = [
  'US','CA','MX','BR','AR','CL','CO','PE',
  'GB','IE','FR','DE','ES','IT','PT','NL','BE','CH','AT','PL','CZ','SE','NO','DK','FI',
  'AU','NZ','JP','KR','SG','MY','TH','VN','ID','PH','IN','AE','TR','IL','EG','ZA'
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function overpass(query) {
  const res = await fetch(OVERPASS_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}` });
  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    throw new Error(`Overpass HTTP ${res.status}: ${t.slice(0,200)}`);
  }
  const data = await res.json();
  return data.elements || [];
}

function bboxToRadiusMeters(bbox) {
  if (!bbox) return 8000;
  const [minLat, minLon, maxLat, maxLon] = bbox; // note OSM order can be lat,lon
  if ([minLat,minLon,maxLat,maxLon].some(v => typeof v !== 'number')) return 8000;
  const meanLat = (minLat + maxLat) / 2;
  const dLat = (maxLat - minLat) * 111_000;
  const dLon = (maxLon - minLon) * 111_000 * Math.cos(meanLat * Math.PI/180);
  const r = Math.max(dLat, dLon) / 2;
  return Math.max(5000, Math.min(30000, Math.round(r)));
}

async function fetchCountryAreaId(iso2) {
  const q = `
  [out:json][timeout:90];
  area["ISO3166-1"="${iso2}"][admin_level=2];
  out ids;`;
  const elems = await overpass(q);
  const area = elems.find(e => e.id && e.type === 'area');
  return area?.id;
}

async function fetchAdmin1(iso2, areaId) {
  const q = `
  [out:json][timeout:180];
  area(${areaId})->.country;
  relation["admin_level"=4](area.country);
  out bb;`;
  const elems = await overpass(q);
  // Each relation may include a bounding box in tags or via out bb
  return elems
    .filter(e => e.type === 'relation')
    .map(e => {
      const bbox = e.bounds ? [e.bounds.minlat, e.bounds.minlon, e.bounds.maxlat, e.bounds.maxlon] : null;
      const center = bbox ? { lat: (bbox[0]+bbox[2])/2, lng: (bbox[1]+bbox[3])/2 } : null;
      const radius = bboxToRadiusMeters(bbox);
      // Overpass area id for a relation is rel.id + 3600000000
      const stateAreaId = 3600000000 + Number(e.id || 0);
      return center ? { lat: center.lat, lng: center.lng, radius, stateAreaId } : null;
    })
    .filter(Boolean);
}

async function fetchCities(iso2, areaId, maxCities = 50) {
  const q = `
  [out:json][timeout:180];
  area(${areaId})->.country;
  (
    node["place"="city"]["population"](area.country);
    node["place"="town"]["population"](area.country);
    node["place"="city"](area.country);
  );
  out tags center;`;
  const elems = await overpass(q);
  const nodes = elems.filter(e => e.type === 'node' || e.type === 'way');
  const enriched = nodes.map(n => {
    const lat = n.lat ?? n.center?.lat;
    const lng = n.lon ?? n.center?.lon;
    const pop = Number(n.tags?.population || 0) || 0;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return { lat, lng, radius: pop >= 500000 ? 20000 : pop >= 100000 ? 12000 : 8000, pop };
  }).filter(Boolean);
  // Sort by population desc, fallback to no-pop entries last
  enriched.sort((a,b) => (b.pop||0) - (a.pop||0));
  const unique = [];
  const seenKey = new Set();
  for (const c of enriched) {
    const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    unique.push({ lat: c.lat, lng: c.lng, radius: c.radius });
    if (unique.length >= maxCities) break;
  }
  return unique;
}

async function fetchTopCitiesForArea(stateAreaId, maxCities = 2) {
  const q = `
  [out:json][timeout:120];
  area(${stateAreaId})->.state;
  (
    node["place"="city"]["population"](area.state);
    node["place"="town"]["population"](area.state);
    node["place"="city"](area.state);
  );
  out tags center;`;
  const elems = await overpass(q).catch(() => []);
  const nodes = elems.filter(e => e.type === 'node' || e.type === 'way');
  const enriched = nodes.map(n => {
    const lat = n.lat ?? n.center?.lat;
    const lng = n.lon ?? n.center?.lon;
    const pop = Number(n.tags?.population || 0) || 0;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return { lat, lng, pop };
  }).filter(Boolean);
  enriched.sort((a,b) => (b.pop||0) - (a.pop||0));
  const uniq = [];
  const seen = new Set();
  for (const c of enriched) {
    const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push({ lat: c.lat, lng: c.lng });
    if (uniq.length >= maxCities) break;
  }
  return uniq;
}

async function buildSeedsForCountry(iso2) {
  const areaId = await fetchCountryAreaId(iso2);
  if (!areaId) throw new Error(`No area id for ${iso2}`);
  const adminStates = await fetchAdmin1(iso2, areaId).catch(() => []);
  const all = [];
  // For each state: 1 centroid seed + up to 2 major city seeds
  for (const st of adminStates) {
    // centroid covering most of state
    all.push({ lat: st.lat, lng: st.lng, radius: Math.min(Math.max(st.radius, 20000), 80000) });
    const topCities = await fetchTopCitiesForArea(st.stateAreaId, 2).catch(() => []);
    for (const c of topCities) {
      // city radius smaller; half of state radius but bounded
      const r = Math.min(Math.max(Math.round((st.radius || 20000)/2), 10000), 50000);
      all.push({ lat: c.lat, lng: c.lng, radius: r });
    }
    await sleep(200);
  }
  // Basic de-dup by ~5km grid
  const kept = [];
  const bin = new Set();
  for (const s of all) {
    const key = `${Math.round(s.lat*10)},${Math.round(s.lng*10)}`; // ~10km bins
    if (bin.has(key)) continue;
    bin.add(key);
    kept.push(s);
  }
  return kept;
}

async function main() {
  const list = (process.env.COUNTRIES?.split(',').map(x => x.trim().toUpperCase()).filter(Boolean) || DEFAULT_COUNTRIES).filter(c => c !== 'CN');
  const out = {};
  let i = 0;
  for (const code of list) {
    i += 1;
    console.log(`[${i}/${list.length}] building seeds for ${code}`);
    try {
      out[code] = await buildSeedsForCountry(code);
      console.log(`  seeds: ${out[code].length}`);
    } catch (e) {
      console.warn(`  ${code} failed:`, (e && e.message) || e);
      out[code] = [];
    }
    await sleep(400);
  }
  const target = path.resolve(process.cwd(), 'scripts/country_seeds.json');
  await fs.writeFile(target, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Saved seeds to ${target}`);
}

main().catch(e => { console.error(e); process.exit(1); });


