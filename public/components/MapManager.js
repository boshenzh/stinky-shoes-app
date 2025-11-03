// Map manager component - orchestrates map initialization and components
import { createMapControls } from './map/MapControls.js';
import { createMapLayers } from './map/MapLayers.js';
import { createPopupManager } from './map/PopupManager.js';
import { createVotePanel } from './map/VotePanel.js';
import { MAP_CONFIG } from '../lib/constants.js';
import { Protocol } from 'pmtiles';

// Register PMTiles protocol with MapLibre (only once)
let protocolRegistered = false;
function ensureProtocolRegistered() {
  if (!protocolRegistered) {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    protocolRegistered = true;
  }
}

export function createMapManager(config) {
  // Register PMTiles protocol (needed for PMTiles sources)
  ensureProtocolRegistered();
  
  // Use Protomaps demo PMTiles file from demo-bucket
  // This is a well-optimized basemap provided by Protomaps
  // The style will be loaded from Protomaps API which provides a complete,
  // production-ready style with proper layers, colors, and labels
  const { protomapsApiKey } = config;
  
  // Option 1: Use Protomaps API style JSON (recommended - full featured)
  // This uses their hosted tiles API with CDN caching
  let styleUrl;
  
  if (protomapsApiKey) {
    // Use Protomaps API style - includes sprites, glyphs, and optimized layers
    styleUrl = `https://api.protomaps.com/styles/v5/light/en.json?key=${protomapsApiKey}`;
  } else {
    // Fallback: Use demo PMTiles with custom style
    // Note: This requires a full style definition matching Protomaps basemap layers
    styleUrl = {
      version: 8,
      sources: {
        'protomaps': {
          type: 'vector',
          url: 'pmtiles://https://demo-bucket.protomaps.com/v4.pmtiles'
        }
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#cccccc' }
        },
        {
          id: 'earth',
          type: 'fill',
          filter: ['==', '$type', 'Polygon'],
          source: 'protomaps',
          'source-layer': 'earth',
          paint: { 'fill-color': '#e2dfda' }
        },
        {
          id: 'landcover',
          type: 'fill',
          source: 'protomaps',
          'source-layer': 'landcover',
          paint: {
            'fill-color': [
              'match',
              ['get', 'kind'],
              'grassland', 'rgba(210, 239, 207, 1)',
              'barren', 'rgba(255, 243, 215, 1)',
              'urban_area', 'rgba(230, 230, 230, 1)',
              'farmland', 'rgba(216, 239, 210, 1)',
              'glacier', 'rgba(255, 255, 255, 1)',
              'scrub', 'rgba(234, 239, 210, 1)',
              'rgba(196, 231, 210, 1)'
            ]
          }
        },
        {
          id: 'water',
          type: 'fill',
          filter: ['==', '$type', 'Polygon'],
          source: 'protomaps',
          'source-layer': 'water',
          paint: { 'fill-color': '#a0c8f0' }
        },
        {
          id: 'roads',
          type: 'line',
          source: 'protomaps',
          'source-layer': 'roads',
          paint: {
            'line-color': '#fff',
            'line-width': [
              'interpolate',
              ['exponential', 1.6],
              ['zoom'],
              10, 0.5,
              16, 4
            ]
          }
        },
        {
          id: 'buildings',
          type: 'fill',
          source: 'protomaps',
          'source-layer': 'buildings',
          paint: { 'fill-color': '#e0dcd8' }
        }
      ],
      glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
      sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light'
    };
  }

  const map = new maplibregl.Map({
    container: 'map',
    style: styleUrl,
    center: MAP_CONFIG.DEFAULT_CENTER,
    zoom: MAP_CONFIG.DEFAULT_ZOOM,
    attributionControl: true,
  });

  // Initialize controls
  const controls = createMapControls(map);

  // Initialize popup manager and vote panel (vote panel needs popup manager reference)
  const popupManager = createPopupManager(map);
  const votePanel = createVotePanel(popupManager);
  
  // Update popup manager with vote panel reference
  popupManager.setVotePanel(votePanel);

  // Initialize layers
  const layers = createMapLayers(map, popupManager);

  // Helper functions
  function getBounds() {
    return map.getBounds();
  }

  function easeTo(center, zoom) {
    map.easeTo({ center, zoom });
  }

  return {
    map,
    addGymsLayer: layers.addGymsLayer.bind(layers),
    updateGymsData: layers.updateGymsData.bind(layers),
    setMode: layers.setMode.bind(layers),
    getMode: layers.getMode.bind(layers),
    setVotedGyms: layers.setVotedGyms.bind(layers),
    getBounds,
    easeTo,
    showGymPopup: popupManager.showGymPopup.bind(popupManager),
    get gymPopup() { return popupManager.popup; },
    get userLngLat() { return controls.userLngLat; },
  };
}
