# MapTiler + MapLibre Demo

Interactive map using MapTiler Streets with MapLibre GL JS.

## Prerequisites

- Node.js 18+
- MapTiler account and API key (free tier works): https://cloud.maptiler.com/

## Setup

1. Copy env file and set your key:

   ```bash
   cp .env.example .env
   # Edit .env and set MAPTILER_API_KEY=your_key
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the server:

   ```bash
  npm run dev
  # Visit http://localhost:3000
  ```

## Fetch worldwide climbing gyms (Ubuntu)

This repo includes a Node script that queries OpenStreetMap (via Overpass API) for indoor climbing gyms and writes a JSON file you can use in the web map.

Commands:

```bash
# Best-effort global grid (slower, but more reliable than a single huge query)
npm run fetch:gyms

# Try a single global query (may fail or be incomplete due to size/time limits)
npm run fetch:gyms:single

# Fetch a region by bounding box (example: continental US)
npm run fetch:gyms:bbox
```

Output files:
- `public/gyms.json` or `public/gyms_us.json`

Notes:
- Data comes from OpenStreetMap and is licensed under ODbL.
- Large/global queries can take a while and may be rate-limited by Overpass. The script uses throttling and retries.
- Results may include some outdoor facilities; tags vary by region. You can refine by bbox or post-filter by tags.

## Configuration

- The frontend requests `/config` to get `MAPTILER_API_KEY`.
- Default style: MapTiler Streets v2. To use a different style (e.g., Streets v4), change `styleUrl` in `public/app.js` to your style JSON URL from MapTiler Cloud, for example:

  ```js
  const styleUrl = `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(maptilerKey)}`;
  ```

## Notes

- You can add geocoding/search later via MapTiler Geocoding API or a MapLibre geocoder plugin.
