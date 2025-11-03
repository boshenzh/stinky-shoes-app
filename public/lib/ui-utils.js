// UI utility functions
export function getStinkScore(g, getSmell) {
  const v = typeof g.smell_avg === 'number' ? g.smell_avg : getSmell(g.id);
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  return Math.max(0, Math.min(100, v));
}

export function stinkBgStyleAttr(v) {
  if (v == null) return '';
  const h = Math.round(120 - 1.2 * v); // 0 -> green(120), 100 -> red(0)
  return `style="background-color: hsla(${h},85%,55%,0.18);"`;
}

export function formatDistance(meters) {
  if (!isFinite(meters)) return 'N/A';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters/1000).toFixed(2)} km`;
}

export function inBbox(item, bounds) {
  const w = bounds.getWest();
  const s = bounds.getSouth();
  const e = bounds.getEast();
  const n = bounds.getNorth();
  return item.lng >= w && item.lng <= e && item.lat >= s && item.lat <= n;
}

