// Map layers module - handles gym layers (heatmap, circles, visited icons)
import { HEATMAP_COLORS, HEATMAP_CONFIG, CIRCLE_CONFIG, DIFFICULTY_COLORS, MAP_CONFIG } from '../../lib/constants.js';

// Icon configuration for visited gyms (programmatically generated red cross)
const VISITED_GYM_ICON = {
  name: 'visited-cross-icon',
  size: 24, // Icon size in pixels (should be larger than circle radius 8px + stroke 3px = ~19px total)
  lineWidth: 3, // Cross line width
  color: '#dc2626', // Red color (#dc2626 is a nice vibrant red)
};

export function createMapLayers(map, popupManager) {
  let gymsSource = null;
  let currentMode = 'stinky';
  let votedGymIds = new Set();
  let visitedIconLoaded = false;

  // ==================== Icon Generation ====================
  function generateCrossIcon() {
    const { size, lineWidth, color } = VISITED_GYM_ICON;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas (transparent background)
    ctx.clearRect(0, 0, size, size);
    
    // Set drawing style
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round'; // Rounded line ends
    ctx.lineJoin = 'round';
    
    // Draw diagonal cross (X shape)
    // Top-left to bottom-right
    ctx.beginPath();
    ctx.moveTo(lineWidth, lineWidth);
    ctx.lineTo(size - lineWidth, size - lineWidth);
    ctx.stroke();
    
    // Top-right to bottom-left
    ctx.beginPath();
    ctx.moveTo(size - lineWidth, lineWidth);
    ctx.lineTo(lineWidth, size - lineWidth);
    ctx.stroke();
    
    return canvas;
  }

  function loadVisitedIcon(callback) {
    const iconName = VISITED_GYM_ICON.name;
    
    if (visitedIconLoaded || map.hasImage(iconName)) {
      if (callback) callback(true);
      return;
    }
    
    if (!map.isStyleLoaded()) {
      map.once('style.load', () => {
        setTimeout(() => loadVisitedIcon(callback), 100);
      });
      return;
    }
    
    try {
      // Generate cross icon using canvas
      const canvas = generateCrossIcon();
      
      // Convert canvas to ImageData/HTMLImageElement
      const img = new Image();
      img.onload = () => {
        try {
          map.addImage(iconName, img);
          visitedIconLoaded = true;
          if (callback) callback(true);
        } catch (err) {
          console.error('[Visited Icon] Error adding image:', err);
          if (callback) callback(false);
        }
      };
      img.onerror = () => {
        console.error('[Visited Icon] Failed to create image from canvas');
        if (callback) callback(false);
      };
      // Convert canvas to data URL and load as image
      img.src = canvas.toDataURL('image/png');
    } catch (error) {
      console.error('[Visited Icon] Error generating cross icon:', error);
      if (callback) callback(false);
    }
  }

  // ==================== Data Preparation ====================
  function prepareGeoJSON(geojson, votedIds) {
    // Update voted gym IDs
    votedGymIds = new Set(votedIds || []);
    
    // Mark voted gyms in GeoJSON
    if (geojson && geojson.features) {
      geojson.features.forEach(feature => {
        const gymId = feature.properties.id;
        feature.properties.has_voted = votedGymIds.has(gymId);
      });
    }
    
    return geojson;
  }

  function prepareHeatmapData(geojson) {
    const heatmapData = JSON.parse(JSON.stringify(geojson));
    if (heatmapData.features) {
      heatmapData.features = heatmapData.features.map(feature => {
        const smellAvg = feature.properties.smell_avg ?? 0;
        const normalizedWeight = typeof smellAvg === 'number' ? smellAvg / 100 : 0;
        feature.properties.weight = Math.max(0.01, Math.min(1, normalizedWeight));
        return feature;
      });
    }
    return heatmapData;
  }

  // ==================== Source Management ====================
  function setupSources(geojson) {
    const heatmapData = prepareHeatmapData(geojson);

    // Add/update heatmap source (unclustered)
    if (!map.getSource('gyms-heatmap-data')) {
      map.addSource('gyms-heatmap-data', {
        type: 'geojson',
        data: heatmapData,
      });
    } else {
      map.getSource('gyms-heatmap-data').setData(heatmapData);
    }

    // Add/update gyms source (clustered for circles and interaction)
    if (!map.getSource('gyms')) {
      map.addSource('gyms', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterRadius: MAP_CONFIG.CLUSTER_RADIUS,
        clusterMaxZoom: MAP_CONFIG.CLUSTER_MAX_ZOOM,
        clusterProperties: {
          'smell_sum': ['+', ['case', ['!=', ['get', 'smell_avg'], null], ['get', 'smell_avg'], 0]],
          'smell_count': ['+', ['case', ['!=', ['get', 'smell_avg'], null], 1, 0]],
        },
      });
      gymsSource = map.getSource('gyms');
    } else {
      map.getSource('gyms').setData(geojson);
      gymsSource = map.getSource('gyms');
    }
  }

  // ==================== Layer Management ====================
  function removeLayersIfExist() {
    const layersToRemove = ['gyms-heatmap', 'gyms-circles', 'gyms-labels', 'gyms-visited'];
    layersToRemove.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });
  }

  function addHeatmapLayer() {
    if (!map.getSource('gyms-heatmap-data')) return;

    map.addLayer({
      id: 'gyms-heatmap',
      type: 'heatmap',
      source: 'gyms-heatmap-data',
      maxzoom: 22,
      layout: {
        visibility: currentMode === 'stinky' ? 'visible' : 'none',
      },
      paint: {
        'heatmap-intensity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 0.5,
          15, HEATMAP_CONFIG.INTENSITY,
        ],
        'heatmap-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, HEATMAP_CONFIG.RADIUS * 0.5,
          10, HEATMAP_CONFIG.RADIUS,
          15, HEATMAP_CONFIG.RADIUS * 1.5,
        ],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          ...HEATMAP_CONFIG.COLOR_STOPS,
        ],
        'heatmap-weight': [
          'interpolate',
          ['linear'],
          ['get', 'weight'],
          0, 0.01,
          1, 1,
        ],
        'heatmap-opacity': HEATMAP_CONFIG.OPACITY,
      },
    });
  }

  function addCirclesLayer() {
    if (!map.getSource('gyms')) return;

    map.addLayer({
      id: 'gyms-circles',
      type: 'circle',
      source: 'gyms',
      minzoom: MAP_CONFIG.CIRCLE_MIN_ZOOM,
      paint: {
        'circle-radius': currentMode === 'stinky' ? CIRCLE_CONFIG.STINKY.RADIUS : CIRCLE_CONFIG.DIFFICULTY.RADIUS,
        'circle-color': currentMode === 'stinky' ? [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'smell_avg'], 0],
          0, HEATMAP_COLORS.LEAST_STINKY,
          25, HEATMAP_COLORS.LOW,
          50, HEATMAP_COLORS.MEDIUM,
          75, HEATMAP_COLORS.HIGH,
          100, HEATMAP_COLORS.MOST_STINKY,
        ] : [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'difficulty_avg'], 0],
          -3, DIFFICULTY_COLORS.EASIEST,
          -2, DIFFICULTY_COLORS.VERY_EASY,
          -1, DIFFICULTY_COLORS.EASY,
          0, DIFFICULTY_COLORS.MEDIUM,
          1, DIFFICULTY_COLORS.HARD,
          2, DIFFICULTY_COLORS.VERY_HARD,
          3, DIFFICULTY_COLORS.HARDEST,
        ],
        'circle-stroke-width': CIRCLE_CONFIG.STROKE_WIDTH,
        'circle-stroke-color': CIRCLE_CONFIG.STROKE_COLOR,
        'circle-opacity': 1,
      },
      filter: ['!', ['has', 'point_count']],
    });
  }

  function addLabelsLayer() {
    if (!map.getSource('gyms')) return;

    map.addLayer({
      id: 'gyms-labels',
      type: 'symbol',
      source: 'gyms',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-offset': [0, 2],
        'text-anchor': 'top',
        'text-size': 12,
      },
      paint: {
        'text-color': '#333',
        'text-halo-color': '#fff',
        'text-halo-width': 2,
      },
      minzoom: MAP_CONFIG.LABEL_MIN_ZOOM,
    });
  }

  function addVisitedLayer() {
    if (!map.getSource('gyms')) return;

    const iconName = VISITED_GYM_ICON.name;
    
    loadVisitedIcon((loaded) => {
      if (!loaded) {
        setTimeout(addVisitedLayer, 500);
        return;
      }

      if (!map.hasImage(iconName)) {
        return;
      }

      if (map.getLayer('gyms-visited')) {
        map.removeLayer('gyms-visited');
      }

      try {
        // Add visited layer at the end (on top of all other layers)
        // This ensures the cross appears on top of the circle markers
        map.addLayer({
          id: 'gyms-visited',
          type: 'symbol',
          source: 'gyms',
          layout: {
            'icon-image': iconName,
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, 0.5,   // Scale factor: 24px * 0.5 = 12px at zoom 4
              8, 0.6,   // Scale factor: 24px * 0.6 = 14.4px at zoom 8
              12, 0.7,  // Scale factor: 24px * 0.7 = 16.8px at zoom 12
              16, 0.8,  // Scale factor: 24px * 0.8 = 19.2px at zoom 16+
            ],
            'icon-anchor': 'center',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'visibility': 'visible',
          },
          paint: {
            'icon-opacity': 1.0,
          },
          filter: ['==', ['get', 'has_voted'], true],
          minzoom: MAP_CONFIG.CIRCLE_MIN_ZOOM,
        });
        // No beforeLayerId means it's added at the end (on top)
      } catch (error) {
        console.error('[Visited Layer] Error:', error);
      }
    });
  }

  // ==================== Event Handlers ====================
  function setupEventHandlers(onClick) {
    // Remove old handlers if they exist
    map.off('click', 'gyms-circles');
    map.off('mouseenter', 'gyms-circles');
    map.off('mouseleave', 'gyms-circles');

    map.on('click', 'gyms-circles', async (e) => {
      if (!e.features || e.features.length === 0) return;
      
      const feature = e.features[0];
      
      // Handle cluster clicks
      if (feature.properties.cluster_id !== undefined) {
        const clusterId = feature.properties.cluster_id;
        const source = map.getSource('gyms');
        const expansionZoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({
          center: e.lngLat,
          zoom: expansionZoom,
          duration: 500,
        });
        return;
      }
      
      const gymId = feature.properties.id;
      const clickedLngLat = e.lngLat;
      await popupManager.showGymPopup(gymId, clickedLngLat);
    });

    map.on('mouseenter', 'gyms-circles', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'gyms-circles', () => {
      map.getCanvas().style.cursor = '';
    });
  }

  // ==================== Main Functions ====================
  function addGymsLayer(geojson, onClick, votedIds = []) {
    if (!map.getContainer() || !map.getContainer().offsetWidth) {
      map.once('load', () => addGymsLayer(geojson, onClick, votedIds));
      return;
    }

    if (!geojson || !geojson.features || !Array.isArray(geojson.features) || geojson.features.length === 0) {
      console.error('Invalid or empty GeoJSON provided to addGymsLayer');
      return;
    }

    try {
      // Prepare data
      const preparedGeoJSON = prepareGeoJSON(geojson, votedIds);

      // Setup sources (must be done before layers)
      setupSources(preparedGeoJSON);

      // Remove old layers
      removeLayersIfExist();

      // Add layers in correct order: heatmap -> circles -> labels -> visited icons
      addHeatmapLayer();
      addCirclesLayer();
      addLabelsLayer();

      // Setup event handlers
      setupEventHandlers(onClick);

      // Add visited layer (async, after icon loads)
      if (map.isStyleLoaded() && map.loaded()) {
        setTimeout(addVisitedLayer, 500);
      } else {
        map.once('style.load', () => setTimeout(addVisitedLayer, 500));
        map.once('load', () => setTimeout(addVisitedLayer, 500));
        map.once('idle', () => setTimeout(addVisitedLayer, 500));
      }
    } catch (error) {
      console.error('Error adding gyms layers:', error);
      if (!map.isStyleLoaded()) {
        map.once('style.load', () => addGymsLayer(geojson, onClick, votedIds));
        map.once('load', () => addGymsLayer(geojson, onClick, votedIds));
      }
    }
  }

  function setMode(mode) {
    if (mode !== 'stinky' && mode !== 'difficulty') return;
    currentMode = mode;

    if (!map.isStyleLoaded()) return;

    // Update heatmap visibility
    if (map.getLayer('gyms-heatmap')) {
      map.setLayoutProperty('gyms-heatmap', 'visibility', mode === 'stinky' ? 'visible' : 'none');
    }

    // Update circle colors and radius
    if (map.getLayer('gyms-circles')) {
      const circleColor = mode === 'stinky' ? [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', 'smell_avg'], 0],
        0, HEATMAP_COLORS.LEAST_STINKY,
        25, HEATMAP_COLORS.LOW,
        50, HEATMAP_COLORS.MEDIUM,
        75, HEATMAP_COLORS.HIGH,
        100, HEATMAP_COLORS.MOST_STINKY,
      ] : [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', 'difficulty_avg'], 0],
        -3, DIFFICULTY_COLORS.EASIEST,
        -2, DIFFICULTY_COLORS.VERY_EASY,
        -1, DIFFICULTY_COLORS.EASY,
        0, DIFFICULTY_COLORS.MEDIUM,
        1, DIFFICULTY_COLORS.HARD,
        2, DIFFICULTY_COLORS.VERY_HARD,
        3, DIFFICULTY_COLORS.HARDEST,
      ];
      
      map.setPaintProperty('gyms-circles', 'circle-color', circleColor);
      map.setPaintProperty('gyms-circles', 'circle-radius', mode === 'stinky' ? CIRCLE_CONFIG.STINKY.RADIUS : CIRCLE_CONFIG.DIFFICULTY.RADIUS);
    }
  }

  function updateGymsData(geojson, votedIds = []) {
    const preparedGeoJSON = prepareGeoJSON(geojson, votedIds);
    const heatmapData = prepareHeatmapData(preparedGeoJSON);

    // Update sources
    if (gymsSource) {
      gymsSource.setData(preparedGeoJSON);
    }
    
    if (map.getSource('gyms-heatmap-data')) {
      map.getSource('gyms-heatmap-data').setData(heatmapData);
    }

    // Update visited layer filter
    if (map.getLayer('gyms-visited')) {
      map.setFilter('gyms-visited', ['==', ['get', 'has_voted'], true]);
    }
  }

  function getMode() {
    return currentMode;
  }

  function setVotedGyms(votedIds) {
    votedGymIds = new Set(votedIds || []);
    
    const source = map.getSource('gyms');
    if (source && source._data && source._data.features) {
      let updated = false;
      source._data.features.forEach(feature => {
        const newHasVoted = votedGymIds.has(feature.properties.id);
        if (feature.properties.has_voted !== newHasVoted) {
          feature.properties.has_voted = newHasVoted;
          updated = true;
        }
      });
      if (updated) {
        source.setData(source._data);
      }
    }
    
    if (map.getLayer('gyms-visited')) {
      map.setFilter('gyms-visited', ['==', ['get', 'has_voted'], true]);
    }
  }

  return {
    addGymsLayer,
    updateGymsData,
    setMode,
    getMode,
    setVotedGyms,
    get source() { return gymsSource; },
  };
}
