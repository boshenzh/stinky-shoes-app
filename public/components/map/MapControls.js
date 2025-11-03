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

  // Initialize geolocation
  map.once('load', () => {
    try {
      geolocate.trigger();
    } catch (e) {
      // ignore if browser blocks without gesture
    }
  });

  geolocate.on('geolocate', (pos) => {
    const { longitude, latitude } = pos.coords || {};
    if (typeof longitude === 'number' && typeof latitude === 'number') {
      currentUserLngLat = [longitude, latitude];
      useAppStore.getState().setUserLocation([longitude, latitude]);
      useAppStore.getState().setViewport({ center: [longitude, latitude], zoom: 12 });
      map.easeTo({ center: [longitude, latitude], zoom: 12 });
    }
  });

  // Locate button handler
  const locateBtn = document.getElementById('locateBtn');
  locateBtn?.addEventListener('click', () => geolocate.trigger());

  return {
    get userLngLat() { return currentUserLngLat; },
    triggerGeolocate: () => geolocate.trigger(),
  };
}

