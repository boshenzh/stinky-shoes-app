// Map manager component - orchestrates map initialization and components
import { createMapControls } from './map/MapControls.js';
import { createMapLayers } from './map/MapLayers.js';
import { createPopupManager } from './map/PopupManager.js';
import { createVotePanel } from './map/VotePanel.js';
import { MAP_CONFIG } from '../lib/constants.js';

export function createMapManager(config) {
  const { maptilerKey } = config;
  const styleUrl = `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(maptilerKey)}`;

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
