// Constants for map configuration

export const HEATMAP_COLORS = {
  LEAST_STINKY: '#d3d3a5',
  LOW: '#7c9558',
  MEDIUM: '#5e864c',
  HIGH: '#4f8450',
  MOST_STINKY: '#477d63',
};

export const HEATMAP_CONFIG = {
  INTENSITY: 0.8, // Base intensity (will be animated)
  RADIUS: 60, // Base radius (will be animated)
  OPACITY: 0.7, // Base opacity (will be animated)
  // Animation settings
  ANIMATION: {
    ENABLED: true,
    PULSE_SPEED: 0.002, // Speed of pulsing (higher = faster)
    INTENSITY_VARIATION: 0.1, // How much intensity varies (0.8 ± 0.2 = 0.6 to 1.0)
    RADIUS_VARIATION: 5, // How much radius varies (60 ± 15 = 45 to 75)
    OPACITY_VARIATION: 0.05, // How much opacity varies (0.7 ± 0.15 = 0.55 to 0.85)
  },
  // Color stops for heatmap intensity (0 = transparent/no data, 1 = maximum intensity)
  // First stop must be transparent so areas with no data don't show any color
  COLOR_STOPS: [
    0.0, 'rgba(234, 238, 208, 0)',  // Transparent version of LEAST_STINKY to avoid dark edges
    0.05, HEATMAP_COLORS.LEAST_STINKY,
    0.3, HEATMAP_COLORS.LOW,
    0.5, HEATMAP_COLORS.MEDIUM,
    0.7, HEATMAP_COLORS.HIGH,
    1.0, HEATMAP_COLORS.MOST_STINKY,
  ],
};

export const CIRCLE_CONFIG = {
  STINKY: {
    RADIUS: 8,
    COLOR: '#7A5901',
  },
  DIFFICULTY: {
    RADIUS: 8,
    COLOR: '#ef4446', // Fallback color (not used when dynamic colors are applied)
  },
  STROKE_WIDTH: 3,
  STROKE_COLOR: '#ffffff',
};

// Difficulty color mapping (from easy to hard)
// difficulty_avg ranges from -3 (easiest) to +3 (hardest)
// Colors: white, yellow, green, blue, red, black
export const DIFFICULTY_COLORS = {
  EASIEST: '#ffffff',    // White (easiest, -3)
  VERY_EASY: '#fef08a',  // Yellow (very easy, -2)
  EASY: '#86efac',       // Green (easy, -1)
  MEDIUM: '#60a5fa',     // Blue (medium, 0)
  HARD: '#f87171',       // Red (hard, +1)
  VERY_HARD: '#dc2626',  // Dark red (very hard, +2) - interpolate between red and black
  HARDEST: '#000000',    // Black (hardest, +3)
};

export const STYLE_COLORS = {
  crimpy: '#ef4446',
  dynos: '#3b82f6',
  overhang: '#f97316',
  slab: '#22c55e',
};

// Helper function to detect mobile devices
export function isMobile() {
  return window.innerWidth < 640;
}

// Get mobile-aware circle min zoom
export function getCircleMinZoom() {
  return isMobile() ? 4 : 4; // Same min zoom for mobile and desktop (was 8 for mobile)
}

// Get mobile-aware map min zoom
export function getMapMinZoom() {
  return isMobile() ? 0 : 0; // Allow any zoom on both mobile and desktop
}

export const MAP_CONFIG = {
  DEFAULT_CENTER: [-122.0090, 37.3349],
  DEFAULT_ZOOM: 12,
  LABEL_MIN_ZOOM: 4, // Labels appear at zoom 4 and above (was 12)
  CLUSTER_RADIUS: 13, // Cluster radius in pixels
  CLUSTER_MIN_ZOOM: 5, // Start clustering at this zoom level (clustering enabled at/above this zoom)
  CIRCLE_MIN_ZOOM: 4, // Hide gym circles below this zoom level (desktop)
  CIRCLE_MIN_ZOOM_MOBILE: 4, // Hide gym circles below this zoom level (mobile) - lowered from 8 to match desktop
  POPUP_ZOOM: 12, // Zoom level when clicking on a marker (desktop)
  POPUP_ZOOM_MOBILE: 12, // Zoom level when clicking on a marker (mobile)
  CITY_ZOOM_THRESHOLD: 12, // Zoom level threshold for showing city-level top 5 (below this shows state-level)
};

