#!/usr/bin/env node
// Fetch climbing gyms worldwide from OpenStreetMap via Overpass API and write to JSON.
// Designed to run on Ubuntu with Node 18+.

import fs from 'node:fs/promises';
import path from 'node:path';

// Basic CLI arg parsing
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.includes('=') ? a.split('=') : [a, true];
    return [k.replace(/^--/, ''), v];
  })
);

const mode = args.mode || 'grid'; // 'single' | 'grid' | 'bbox'
const cellDeg = parseFloat(args.cell || '10'); // degrees for grid cells
const outPath = args.out || 'public/gyms.json';
const bboxStr = args.bbox || null; // minLon,minLat,maxLon,maxLat
const concurrency = Math.max(1, parseInt(args.concurrency || '2', 10));
const delayMs = Math.max(0, parseInt(args.delay || '400', 10));

// Overpass API endpoints (rotated on failure)
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// Build an Overpass QL for a given bbox (or global when omitted)
function buildQuery(bbox) {
  const bboxFilter = bbox ? `(${bbox.join(',')})` : '';
  // We target typical indoor climbing gym tags.
  // This may include some outdoor facilities; downstream can filter further if needed.
  return `
    [out:json][timeout:120];
    (
      node${bboxFilter}["sport"="climbing"]["indoor"="yes"];
      way${bboxFilter}["sport"="climbing"]["indoor"="yes"];
      relation${bboxFilter}["sport"="climbing"]["indoor"="yes"];

      node${bboxFilter}["leisure"="sports_centre"]["sport"="climbing"];
      way${bboxFilter}["leisure"="sports_centre"]["sport"="climbing"];
      relation${bboxFilter}["leisure"="sports_centre"]["sport"="climbing"];

      node${bboxFilter}["leisure"="fitness_centre"]["sport"="climbing"];
      way${bboxFilter}["leisure"="fitness_centre"]["sport"="climbing"];
      relation${bboxFilter}["leisure"="fitness_centre"]["sport"="climbing"];

      node${bboxFilter}["climbing"="indoor"];
      way${bboxFilter}["climbing"="indoor"];
      relation${bboxFilter}["climbing"="indoor"];
    );
    out center tags;
  `;
}

async function overpassFetch(query) {
  let lastErr;
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw lastErr;
}

function normalizeElement(el) {
  // Ways/relations provide a center property; nodes have lat/lon.
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  const name = el.tags?.name || null;
  const addr = [
    el.tags?.['addr:housenumber'],
    el.tags?.['addr:street'],
    el.tags?.['addr:city'],
    el.tags?.['addr:state'],
    el.tags?.['addr:postcode'],
    el.tags?.['addr:country'],
  ].filter(Boolean).join(', ');

  return {
    id: `${el.type}/${el.id}`,
    name,
    latitude: lat,
    longitude: lon,
    address: addr || null,
    phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
    url: el.tags?.website || el.tags?.url || null,
    categories: deriveCategories(el.tags || {}),
    source: 'osm',
    osm_id: el.id,
    osm_type: el.type,
    tags: el.tags || {},
  };
}

function deriveCategories(tags) {
  const out = new Set();
  if (tags.sport === 'climbing') out.add('climbing');
  if (tags.indoor === 'yes' || tags['climbing'] === 'indoor') out.add('indoor');
  if (tags.leisure === 'sports_centre' || tags.leisure === 'fitness_centre') out.add('sports_centre');
  return Array.from(out);
}

function dedupeByIdAndCoord(items) {
  const seen = new Set();
  const key = (x) => `${x.id}|${Math.round(x.latitude * 1e5)}|${Math.round(x.longitude * 1e5)}`;
  const out = [];
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function buildGlobalGrid(cell) {
  const boxes = [];
  const minLat = -85, maxLat = 85; // avoid poles where tiles distort and data sparse
  const minLon = -180, maxLon = 180;
  for (let lat = minLat; lat < maxLat; lat += cell) {
    const maxLatCell = Math.min(lat + cell, maxLat);
    for (let lon = minLon; lon < maxLon; lon += cell) {
      const maxLonCell = Math.min(lon + cell, maxLon);
      boxes.push([lon, lat, maxLonCell, maxLatCell]);
    }
  }
  return boxes;
}

async function runSingle() {
  const data = await overpassFetch(buildQuery(null));
  const items = (data.elements || []).map(normalizeElement).filter(Boolean);
  return dedupeByIdAndCoord(items);
}

async function runBBox(bbox) {
  const data = await overpassFetch(buildQuery(bbox));
  const items = (data.elements || []).map(normalizeElement).filter(Boolean);
  return dedupeByIdAndCoord(items);
}

async function runGrid(cell) {
  const boxes = buildGlobalGrid(cell);
  const results = [];
  let i = 0;
  const queue = [...boxes];

  async function worker() {
    while (queue.length) {
      const box = queue.shift();
      i++;
      try {
        const data = await overpassFetch(buildQuery(box));
        const items = (data.elements || []).map(normalizeElement).filter(Boolean);
        results.push(...items);
      } catch (e) {
        // Best-effort: skip on persistent failure.
      }
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return dedupeByIdAndCoord(results);
}

async function main() {
  let gyms = [];
  if (mode === 'single') {
    gyms = await runSingle().catch(() => []);
    if (gyms.length === 0) {
      console.warn('Single query returned no results or failed. Consider --mode=grid.');
    }
  } else if (mode === 'bbox') {
    if (!bboxStr) throw new Error('Provide --bbox=minLon,minLat,maxLon,maxLat');
    const bbox = bboxStr.split(',').map(Number);
    if (bbox.length !== 4 || bbox.some((n) => Number.isNaN(n))) {
      throw new Error('Invalid --bbox format. Expected minLon,minLat,maxLon,maxLat');
    }
    gyms = await runBBox(bbox);
  } else {
    gyms = await runGrid(cellDeg);
  }

  // Sort for stable output
  gyms.sort((a, b) => (a.name || '').localeCompare(b.name || '') || a.latitude - b.latitude);

  const outAbs = path.resolve(process.cwd(), outPath);
  await fs.mkdir(path.dirname(outAbs), { recursive: true });
  await fs.writeFile(outAbs, JSON.stringify(gyms, null, 2));
  console.log(`Wrote ${gyms.length} gyms to ${outAbs}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
