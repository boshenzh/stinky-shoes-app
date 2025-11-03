// Map controls module - handles geolocation and navigation controls
import { useAppStore } from '../../store/index.js';

export function createMapControls(map) {
  // Map controls
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true,
  });
  map.addControl(geolocate);

  // State
  let currentUserLngLat = null;
  let shouldRecenter = false; // Only recenter when user clicks the button

  // Listen for geolocation updates (for storing location, but don't auto-recenter)
  geolocate.on('geolocate', (pos) => {
    const { longitude, latitude } = pos.coords || {};
    if (typeof longitude === 'number' && typeof latitude === 'number') {
      currentUserLngLat = [longitude, latitude];
      useAppStore.getState().setUserLocation([longitude, latitude]);
      
      // Only recenter if user explicitly clicked the locate button
      if (shouldRecenter) {
        useAppStore.getState().setViewport({ center: [longitude, latitude], zoom: 12 });
        map.easeTo({ center: [longitude, latitude], zoom: 12 });
        shouldRecenter = false; // Reset flag after recentering
      }
    }
  });

  // Listen for geolocation errors (location tracking may fail silently)
  geolocate.on('error', (e) => {
    // Silently handle errors - user may have denied permission
    console.debug('Geolocation error:', e.code, e.message);
  });

  // Locate button handler - only recenter when user clicks
  const locateBtn = document.getElementById('locateBtn');
  locateBtn?.addEventListener('click', () => {
    shouldRecenter = true; // Set flag to recenter on next location update
    geolocate.trigger();
  });

  return {
    get userLngLat() { return currentUserLngLat; },
    triggerGeolocate: () => geolocate.trigger(),
  };
}

