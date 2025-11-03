// Map layers module - handles gym layers (heatmap, circles, visited icons)
import { HEATMAP_COLORS, HEATMAP_CONFIG, CIRCLE_CONFIG, DIFFICULTY_COLORS, MAP_CONFIG } from '../../lib/constants.js';

// Icon configuration for visited gyms (programmatically generated red cross)
// Use larger size for better visibility, especially on mobile
const VISITED_GYM_ICON = {
  name: 'visited-cross-icon',
  size: 32, // Icon size in pixels (increased from 24 for better mobile visibility)
  lineWidth: 4, // Cross line width (increased from 3 for better visibility)
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
      console.log('[Visited Icon] Icon already loaded');
      if (callback) callback(true);
      return;
    }
    
    // Wait for style to be fully loaded before adding images
    if (!map.isStyleLoaded() || !map.loaded()) {
      console.log('[Visited Icon] Waiting for map to load...');
      const waitForStyle = () => {
        if (map.isStyleLoaded() && map.loaded()) {
          loadVisitedIcon(callback);
        } else {
          map.once('style.load', waitForStyle);
          map.once('load', waitForStyle);
        }
      };
      waitForStyle();
      return;
    }
    
    try {
      console.log('[Visited Icon] Generating cross icon...');
      const canvas = generateCrossIcon();
      
      // Verify canvas was created and has content
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        console.error('[Visited Icon] Invalid canvas generated');
        if (callback) callback(false);
        return;
      }
      
      // Convert to data URL - try PNG first, fallback to other formats for mobile compatibility
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL('image/png');
        if (!dataUrl || dataUrl === 'data:,') {
          // Fallback for browsers that don't support PNG encoding
          dataUrl = canvas.toDataURL();
        }
      } catch (e) {
        console.warn('[Visited Icon] PNG encoding failed, trying default:', e);
        dataUrl = canvas.toDataURL();
      }
      
      if (!dataUrl || dataUrl === 'data:,') {
        console.error('[Visited Icon] Failed to create data URL from canvas');
        if (callback) callback(false);
        return;
      }
      
      const img = new Image();
      
      // Set a timeout for image loading (especially important for mobile)
      const loadTimeout = setTimeout(() => {
        console.warn('[Visited Icon] Image load timeout');
        if (callback) callback(false);
      }, 5000);
      
      img.onload = () => {
        clearTimeout(loadTimeout);
        try {
          map.addImage(iconName, img);
          visitedIconLoaded = true;
          console.log('[Visited Icon] Icon added successfully', {
            iconName,
            imageSize: `${img.width}x${img.height}`,
            canvasSize: `${canvas.width}x${canvas.height}`,
            hasImage: map.hasImage(iconName)
          });
          if (callback) callback(true);
        } catch (err) {
          clearTimeout(loadTimeout);
          console.error('[Visited Icon] Error adding image:', err);
          if (callback) callback(false);
        }
      };
      
      img.onerror = (e) => {
        clearTimeout(loadTimeout);
        console.error('[Visited Icon] Failed to create image from canvas', e);
        console.error('[Visited Icon] Data URL length:', dataUrl.length);
        if (callback) callback(false);
      };
      
      img.src = dataUrl;
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

  // Find insertion point for custom layers - insert before Protomaps label layers
  function findInsertionPoint() {
    // Try to find Protomaps label layers - insert before them
    const labelLayerIds = [
      'address_label',
      'water_waterway_label',
      'roads_labels_minor',
      'water_label_ocean',
      'earth_label_islands',
      'water_label_lakes',
      'roads_labels_major',
      'pois',
      'places_subplace',
      'places_region',
      'places_locality',
      'places_country'
    ];

    // Find the first existing label layer
    for (const layerId of labelLayerIds) {
      if (map.getLayer(layerId)) {
        return layerId;
      }
    }

    // If no label layers found, try inserting before any layer with "label" in the name
    try {
      const style = map.getStyle();
      if (style && style.layers) {
        for (let i = style.layers.length - 1; i >= 0; i--) {
          const layer = style.layers[i];
          if (layer.id && layer.id.includes('label')) {
            return layer.id;
          }
        }
      }
    } catch (e) {
      // Style might not be accessible
    }

    // Fallback: return null (adds at end)
    return null;
  }

  function addHeatmapLayer() {
    if (!map.getSource('gyms-heatmap-data')) return;

    // Find a good insertion point before Protomaps label layers
    const beforeLayer = findInsertionPoint();
    
    const layerConfig = {
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
    };

    if (beforeLayer) {
      layerConfig.beforeLayer = beforeLayer;
    }

    map.addLayer(layerConfig);
  }

  function addCirclesLayer() {
    if (!map.getSource('gyms')) return;

    const beforeLayer = findInsertionPoint();
    
    const layerConfig = {
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
    };

    if (beforeLayer) {
      layerConfig.beforeLayer = beforeLayer;
    }

    map.addLayer(layerConfig);
  }

  function addLabelsLayer() {
    if (!map.getSource('gyms')) return;

    const beforeLayer = findInsertionPoint();
    
    const layerConfig = {
      id: 'gyms-labels',
      type: 'symbol',
      source: 'gyms',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
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
    };

    if (beforeLayer) {
      layerConfig.beforeLayer = beforeLayer;
    }

    map.addLayer(layerConfig);
  }

  function addVisitedLayer() {
    if (!map.getSource('gyms')) {
      console.warn('[Visited Layer] No gyms source found');
      return;
    }
    
    if (!map.isStyleLoaded() || !map.loaded()) {
      console.log('[Visited Layer] Map not ready, waiting...');
      const waitForMap = () => {
        if (map.isStyleLoaded() && map.loaded()) {
          addVisitedLayer();
        } else {
          map.once('style.load', waitForMap);
          map.once('load', waitForMap);
        }
      };
      waitForMap();
      return;
    }

    const iconName = VISITED_GYM_ICON.name;
    
    loadVisitedIcon((loaded) => {
      if (!loaded) {
        console.warn('[Visited Layer] Icon not loaded, retrying...');
        // Retry after a delay if icon isn't loaded yet
        setTimeout(addVisitedLayer, 500);
        return;
      }
      
      if (!map.hasImage(iconName)) {
        console.warn('[Visited Layer] Icon not in map images, retrying...');
        setTimeout(addVisitedLayer, 500);
        return;
      }

      // Remove existing layer if present
      if (map.getLayer('gyms-visited')) {
        console.log('[Visited Layer] Removing existing layer');
        map.removeLayer('gyms-visited');
      }

      try {
        // Insert visited layer after gyms-circles but before gyms-labels (if exists)
        // This ensures the red cross appears on top of the circle markers
        let beforeLayer = null;
        
        // First try to insert before gyms-labels (if it exists)
        if (map.getLayer('gyms-labels')) {
          beforeLayer = 'gyms-labels';
          console.log('[Visited Layer] Inserting before gyms-labels');
        } else {
          // If no labels layer, try to insert before Protomaps label layers
          const protoBeforeLayer = findInsertionPoint();
          if (protoBeforeLayer) {
            beforeLayer = protoBeforeLayer;
            console.log('[Visited Layer] Inserting before Protomaps layer:', protoBeforeLayer);
          } else {
            console.log('[Visited Layer] No beforeLayer, adding at end (on top)');
          }
        }
        
        // Verify source has data with has_voted property
        const source = map.getSource('gyms');
        let hasVotedCount = 0;
        if (source && source._data && source._data.features) {
          hasVotedCount = source._data.features.filter(f => f.properties?.has_voted === true).length;
          console.log(`[Visited Layer] Found ${hasVotedCount} gyms with has_voted=true`);
        }
        
        const layerConfig = {
          id: 'gyms-visited',
          type: 'symbol',
          source: 'gyms',
          layout: {
            'icon-image': iconName,
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, 0.6,
              8, 0.7,
              12, 0.85,
              16, 1.0,
            ],
            'icon-anchor': 'center',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: {
            'icon-opacity': 1.0,
            // Add a slight halo effect for better visibility, especially on mobile
            'icon-halo-color': 'rgba(255, 255, 255, 0.9)',
            'icon-halo-width': 2,
            'icon-halo-blur': 1,
          },
          filter: ['==', ['get', 'has_voted'], true],
          minzoom: MAP_CONFIG.CIRCLE_MIN_ZOOM,
        };

        if (beforeLayer) {
          layerConfig.beforeLayer = beforeLayer;
        }

        map.addLayer(layerConfig);
        console.log('[Visited Layer] Successfully added visited layer', {
          beforeLayer: beforeLayer || 'end',
          hasVotedCount,
          iconName,
          iconExists: map.hasImage(iconName)
        });
      } catch (error) {
        console.error('[Visited Layer] Error adding layer:', error);
        console.error('[Visited Layer] Error details:', {
          message: error.message,
          stack: error.stack
        });
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
    // Validate container and data
    if (!map.getContainer() || !map.getContainer().offsetWidth) {
      map.once('load', () => addGymsLayer(geojson, onClick, votedIds));
      return;
    }

    if (!geojson || !geojson.features || !Array.isArray(geojson.features) || geojson.features.length === 0) {
      console.error('[MapLayers] Invalid or empty GeoJSON provided to addGymsLayer');
      console.error('[MapLayers] GeoJSON:', geojson);
      console.error('[MapLayers] Features count:', geojson?.features?.length || 0);
      return;
    }

    console.log(`[MapLayers] Adding ${geojson.features.length} gym markers to map`);

    // Ensure style is loaded before adding layers
    if (!map.isStyleLoaded() || !map.loaded()) {
      const waitAndAdd = () => {
        if (map.isStyleLoaded() && map.loaded()) {
          addGymsLayer(geojson, onClick, votedIds);
        } else {
          map.once('style.load', waitAndAdd);
          map.once('load', waitAndAdd);
        }
      };
      waitAndAdd();
      return;
    }

    try {
      const preparedGeoJSON = prepareGeoJSON(geojson, votedIds);
      setupSources(preparedGeoJSON);
      removeLayersIfExist();

      // Add layers in order: heatmap -> circles -> labels -> visited icons
      addHeatmapLayer();
      addCirclesLayer();
      addLabelsLayer();
      setupEventHandlers(onClick);

      // Add visited layer after circles and labels are added
      // Use a small delay to ensure circles layer exists before adding visited layer on top
      setTimeout(() => {
        addVisitedLayer();
      }, 100);
    } catch (error) {
      console.error('Error adding gyms layers:', error);
      // Retry if style wasn't ready
      if (!map.isStyleLoaded()) {
        map.once('style.load', () => addGymsLayer(geojson, onClick, votedIds));
      }
    }
  }

  function setMode(mode) {
    if (mode !== 'stinky' && mode !== 'difficulty') return;
    currentMode = mode;

    if (!map.isStyleLoaded() || !map.loaded()) return;

    // Update heatmap visibility
    const heatmapLayer = map.getLayer('gyms-heatmap');
    if (heatmapLayer) {
      map.setLayoutProperty('gyms-heatmap', 'visibility', mode === 'stinky' ? 'visible' : 'none');
    }

    // Update circle colors and radius
    const circlesLayer = map.getLayer('gyms-circles');
    if (circlesLayer) {
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
      map.setPaintProperty('gyms-circles', 'circle-radius', 
        mode === 'stinky' ? CIRCLE_CONFIG.STINKY.RADIUS : CIRCLE_CONFIG.DIFFICULTY.RADIUS
      );
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
