// Consolidated utility functions

// ==================== Distance & Geography ====================

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => d * Math.PI / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Format distance in a human-readable format
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance (e.g., "500 m" or "2.5 km")
 */
export function formatDistance(meters) {
  if (!isFinite(meters)) return 'N/A';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters/1000).toFixed(2)} km`;
}

/**
 * Check if an item is within a bounding box
 * @param {Object} item - Object with lng and lat properties
 * @param {maplibregl.LngLatBounds} bounds - Map bounds
 * @returns {boolean} True if item is within bounds
 */
export function inBbox(item, bounds) {
  const w = bounds.getWest();
  const s = bounds.getSouth();
  const e = bounds.getEast();
  const n = bounds.getNorth();
  return item.lng >= w && item.lng <= e && item.lat >= s && item.lat <= n;
}

// ==================== UI Utilities ====================

/**
 * Get stink score for a gym (0-100)
 * @param {Object} g - Gym object with smell_avg property
 * @returns {number|null} Stink score or null if unavailable
 */
export function getStinkScore(g) {
  // API always provides smell_avg, so no need for fallback
  const v = typeof g.smell_avg === 'number' ? g.smell_avg : null;
  if (v == null || Number.isNaN(v)) return null;
  return Math.max(0, Math.min(100, v));
}

/**
 * Generate background style attribute for stink score
 * @param {number|null} v - Stink score (0-100)
 * @returns {string} Style attribute string
 */
export function stinkBgStyleAttr(v) {
  if (v == null) return '';
  const h = Math.round(120 - 1.2 * v); // 0 -> green(120), 100 -> red(0)
  return `style="background-color: hsla(${h},85%,55%,0.18);"`;
}

