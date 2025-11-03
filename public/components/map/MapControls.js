// Map controls module - handles geolocation and navigation controls
import { useAppStore } from '../../store/index.js';
import { createStyleSwitcher } from './StyleSwitcher.js';

export function createMapControls(map, protomapsApiKey) {
  // Custom navigation control - only zoom buttons (no compass/bearing reset)
  const navControl = new maplibregl.NavigationControl({
    showCompass: false, // Hide the compass/bearing reset button
    showZoom: true, // Keep zoom controls
  });
  map.addControl(navControl, 'top-right');
  
  // Style switcher (positioned below zoom controls)
  const styleSwitcher = createStyleSwitcher(map, protomapsApiKey);
  map.addControl(styleSwitcher, 'top-right');
  
  // Geolocate control - positioned where compass used to be (top-right, inside nav control area)
  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true,
  });
  
  // Add geolocate control to map (it will appear in the same position as compass would)
  map.addControl(geolocate, 'top-right');

  // State
  let currentUserLngLat = null;
  let shouldRecenter = false; // Track if user clicked the geolocate button

  // Listen for when user activates geolocate control (button click)
  geolocate.on('trackuserlocationstart', () => {
    // User clicked the geolocate button - set flag to recenter
    shouldRecenter = true;
  });

  // Listen for geolocation updates
  geolocate.on('geolocate', (pos) => {
    const { longitude, latitude } = pos.coords || {};
    if (typeof longitude === 'number' && typeof latitude === 'number') {
      currentUserLngLat = [longitude, latitude];
      useAppStore.getState().setUserLocation([longitude, latitude]);
      
      // Recenter if user clicked the button (shouldRecenter flag is set)
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
    shouldRecenter = false; // Reset flag on error
  });

  return {
    get userLngLat() { return currentUserLngLat; },
    triggerGeolocate: () => geolocate.trigger(),
  };
}

