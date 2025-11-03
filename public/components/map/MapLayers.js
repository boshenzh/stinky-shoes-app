// Map layers module - handles gym layers (heatmap, circles, visited icons)
import { HEATMAP_COLORS, HEATMAP_CONFIG, CIRCLE_CONFIG, DIFFICULTY_COLORS, MAP_CONFIG, getCircleMinZoom } from '../../lib/constants.js';

// Icon configuration for visited gyms (programmatically generated red cross)
const VISITED_GYM_ICON = {
  name: 'visited-cross-icon',
  size: 32,
  lineWidth: 4,
  color: '#dc2626',
};

// Retry configuration for waiting on layers
const RETRY_CONFIG = {
  maxRetries: 10,
  delay: 50, // milliseconds
};

export function createMapLayers(map, popupManager) {
  let gymsSource = null;
  let currentMode = 'stinky';
  let votedGymIds = new Set();
  let visitedIconLoaded = false;
  let heatmapAnimationId = null;
  let animationStartTime = null;

  // ==================== Utility Functions ====================
  
  /**
   * Waits for a layer to exist, then calls the callback
   * @param {string} layerId - The ID of the layer to wait for
   * @param {Function} callback - Called when layer exists or max retries reached
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} delay - Delay between retries in ms
   */
  function waitForLayer(layerId, callback, maxRetries = RETRY_CONFIG.maxRetries, delay = RETRY_CONFIG.delay) {
    if (map.getLayer(layerId)) {
      callback(true);
      return;
    }

    let retries = 0;
    const check = () => {
      if (map.getLayer(layerId)) {
        callback(true);
      } else if (retries < maxRetries) {
        retries++;
        setTimeout(check, delay);
      } else {
        callback(false);
      }
    };
    setTimeout(check, delay);
  }

  // ==================== Icon Generation ====================
  
  function generateCrossIcon() {
    const { size, lineWidth, color } = VISITED_GYM_ICON;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw diagonal cross (X shape)
    ctx.beginPath();
    ctx.moveTo(lineWidth, lineWidth);
    ctx.lineTo(size - lineWidth, size - lineWidth);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(size - lineWidth, lineWidth);
    ctx.lineTo(lineWidth, size - lineWidth);
    ctx.stroke();
    
    return canvas;
  }

  function loadVisitedIcon(callback) {
    const iconName = VISITED_GYM_ICON.name;
    
    // If already loaded, return immediately
    if (visitedIconLoaded && map.hasImage(iconName)) {
      if (callback) callback(true);
      return;
    }
    
    // Wait for circles layer (guarantees style is loaded)
    waitForLayer('gyms-circles', (layerExists) => {
      if (!layerExists) {
        console.warn('[Visited Icon] Circles layer not found, proceeding anyway');
      }
      
      try {
        const canvas = generateCrossIcon();
        
        if (!canvas || canvas.width === 0 || canvas.height === 0) {
          console.error('[Visited Icon] Invalid canvas generated');
          if (callback) callback(false);
          return;
        }
        
        // Convert to data URL
        let dataUrl;
        try {
          dataUrl = canvas.toDataURL('image/png');
          if (!dataUrl || dataUrl === 'data:,') {
            dataUrl = canvas.toDataURL();
          }
        } catch (e) {
          console.warn('[Visited Icon] PNG encoding failed, using default:', e);
          dataUrl = canvas.toDataURL();
        }
        
        if (!dataUrl || dataUrl === 'data:,') {
          console.error('[Visited Icon] Failed to create data URL');
          if (callback) callback(false);
          return;
        }
        
        const img = new Image();
        const loadTimeout = setTimeout(() => {
          console.warn('[Visited Icon] Image load timeout');
          if (callback) callback(false);
        }, 5000);
        
        img.onload = () => {
          clearTimeout(loadTimeout);
          try {
            map.addImage(iconName, img);
            visitedIconLoaded = true;
            if (callback) callback(true);
          } catch (err) {
            clearTimeout(loadTimeout);
            console.error('[Visited Icon] Error adding image:', err);
            if (callback) callback(false);
          }
        };
        
        img.onerror = () => {
          clearTimeout(loadTimeout);
          console.error('[Visited Icon] Failed to load image');
          if (callback) callback(false);
        };
        
        img.src = dataUrl;
      } catch (error) {
        console.error('[Visited Icon] Error generating icon:', error);
        if (callback) callback(false);
      }
    });
  }

  // ==================== Data Preparation ====================
  
  function prepareGeoJSON(geojson, votedIds) {
    votedGymIds = new Set(votedIds || []);
    
    if (geojson && geojson.features) {
      geojson.features.forEach(feature => {
        const gymId = feature.properties.id;
        feature.properties.has_voted = votedGymIds.has(gymId);
      });
    }
    
    return geojson;
  }

  function prepareHeatmapData(geojson) {
    if (!geojson || !geojson.features) {
      return { type: 'FeatureCollection', features: [] };
    }

    const heatmapFeatures = geojson.features
      .filter(f => {
        const props = f.properties || {};
        return props.smell_avg !== null && props.smell_avg !== undefined;
      })
      .map(f => {
        const props = f.properties || {};
        return {
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            weight: props.smell_avg / 100,
          },
        };
      });

    return {
      type: 'FeatureCollection',
      features: heatmapFeatures,
    };
  }

  // ==================== Source Management ====================
  
  function setupSources(geojson) {
    const heatmapData = prepareHeatmapData(geojson);

    // Set up main gyms source
    // Note: MapLibre uses clusterMaxZoom to STOP clustering above that zoom
    // To make clustering START at CLUSTER_MIN_ZOOM, we set clusterMaxZoom very high
    // This means clustering happens from CLUSTER_MIN_ZOOM up to a very high zoom
    if (!map.getSource('gyms')) {
      map.addSource('gyms', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 22, // Very high zoom - clustering won't stop (effectively enables clustering from CLUSTER_MIN_ZOOM)
        clusterRadius: MAP_CONFIG.CLUSTER_RADIUS,
      });
      gymsSource = map.getSource('gyms');
    } else {
      map.getSource('gyms').setData(geojson);
    }

    // Set up heatmap data source
    if (!map.getSource('gyms-heatmap-data')) {
      map.addSource('gyms-heatmap-data', {
        type: 'geojson',
        data: heatmapData,
      });
    } else {
      map.getSource('gyms-heatmap-data').setData(heatmapData);
    }
  }

  // ==================== Layer Insertion Point ====================
  
  function findInsertionPoint() {
    // Find a suitable layer in Protomaps style to insert custom layers before
    // This ensures our layers appear above the basemap but below labels
    const style = map.getStyle();
    if (!style || !style.layers) return null;

    // Look for common Protomaps label layers
    const labelLayerIds = [
      'place-labels',
      'road-labels',
      'water-labels',
      'landcover-labels',
      'poi-labels',
    ];

    for (const layerId of labelLayerIds) {
      const layer = style.layers.find(l => l.id === layerId);
      if (layer) {
        return layerId;
      }
    }

    return null;
  }

  // ==================== Layer Management ====================
  
  function removeLayersIfExist() {
    // Stop animation before removing layers
    stopHeatmapAnimation();
    
    const layerIds = ['gyms-heatmap', 'gyms-circles', 'gyms-labels', 'gyms-visited'];
    layerIds.forEach(id => {
      if (map.getLayer(id)) {
        map.removeLayer(id);
      }
    });
  }

  function addHeatmapLayer() {
    if (!map.getSource('gyms-heatmap-data')) return;

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
    
    // Start animation if enabled
    if (HEATMAP_CONFIG.ANIMATION.ENABLED && currentMode === 'stinky') {
      startHeatmapAnimation();
    }
  }
  
  /**
   * Animates the heatmap to create a pulsing "stinky" effect
   * Uses sine waves to create smooth pulsing animation
   */
  function startHeatmapAnimation() {
    if (heatmapAnimationId !== null) return; // Already animating
    
    const layer = map.getLayer('gyms-heatmap');
    if (!layer) return;
    
    animationStartTime = animationStartTime || performance.now();
    
    function animate() {
      const layer = map.getLayer('gyms-heatmap');
      if (!layer || currentMode !== 'stinky') {
        stopHeatmapAnimation();
        return;
      }
      
      const elapsed = (performance.now() - animationStartTime) * HEATMAP_CONFIG.ANIMATION.PULSE_SPEED;
      
      // Create pulsing effect using sine waves (different phases for variety)
      const intensityPulse = Math.sin(elapsed);
      const radiusPulse = Math.sin(elapsed * 0.8 + Math.PI / 4); // Different phase
      const opacityPulse = Math.sin(elapsed * 1.2 - Math.PI / 3); // Different phase
      
      // Calculate animated values
      const animatedIntensity = HEATMAP_CONFIG.INTENSITY + 
        (intensityPulse * HEATMAP_CONFIG.ANIMATION.INTENSITY_VARIATION);
      const animatedRadius = HEATMAP_CONFIG.RADIUS + 
        (radiusPulse * HEATMAP_CONFIG.ANIMATION.RADIUS_VARIATION);
      const animatedOpacity = HEATMAP_CONFIG.OPACITY + 
        (opacityPulse * HEATMAP_CONFIG.ANIMATION.OPACITY_VARIATION);
      
      // Update heatmap properties dynamically
      try {
        // Update intensity at zoom 15 (where it's most visible)
        map.setPaintProperty('gyms-heatmap', 'heatmap-intensity', [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 0.5,
          15, Math.max(0.1, Math.min(1.5, animatedIntensity)), // Clamp between 0.1 and 1.5
        ]);
        
        // Update radius
        map.setPaintProperty('gyms-heatmap', 'heatmap-radius', [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, animatedRadius * 0.5,
          10, animatedRadius,
          15, animatedRadius * 1.5,
        ]);
        
        // Update opacity
        map.setPaintProperty('gyms-heatmap', 'heatmap-opacity', 
          Math.max(0.3, Math.min(1.0, animatedOpacity)) // Clamp between 0.3 and 1.0
        );
      } catch (e) {
        // Layer might have been removed
        stopHeatmapAnimation();
        return;
      }
      
      heatmapAnimationId = requestAnimationFrame(animate);
    }
    
    animate();
  }
  
  function stopHeatmapAnimation() {
    if (heatmapAnimationId !== null) {
      cancelAnimationFrame(heatmapAnimationId);
      heatmapAnimationId = null;
    }
  }

  function addCirclesLayer(callback) {
    if (!map.getSource('gyms')) {
      if (callback) callback(false);
      return;
    }

    const beforeLayer = findInsertionPoint();
    
    const layerConfig = {
      id: 'gyms-circles',
      type: 'circle',
      source: 'gyms',
      minzoom: getCircleMinZoom(),
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
    
    // Verify layer was added and call callback
    const layerAdded = !!map.getLayer('gyms-circles');
    if (callback) callback(layerAdded);
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
    
    // Wait for circles layer (guarantees style is loaded)
    waitForLayer('gyms-circles', (layerExists) => {
      if (!layerExists) {
        console.warn('[Visited Layer] Circles layer not found, aborting');
        return;
      }
      
      const iconName = VISITED_GYM_ICON.name;
      
      loadVisitedIcon((iconLoaded) => {
        if (!iconLoaded) {
          console.warn('[Visited Layer] Icon not loaded, retrying...');
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
          map.removeLayer('gyms-visited');
        }

        try {
          // Determine insertion point
          const beforeLayer = map.getLayer('gyms-labels') ? 'gyms-labels' : findInsertionPoint();
          
          // Count voted gyms for debugging
          const source = map.getSource('gyms');
          let hasVotedCount = 0;
          if (source && source._data && source._data.features) {
            hasVotedCount = source._data.features.filter(f => f.properties?.has_voted === true).length;
            if (hasVotedCount === 0) {
              console.warn('[Visited Layer] No gyms with has_voted=true');
            }
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
              'icon-halo-color': 'rgba(255, 255, 255, 0.9)',
              'icon-halo-width': 2,
              'icon-halo-blur': 1,
            },
            filter: ['==', ['get', 'has_voted'], true],
            minzoom: getCircleMinZoom(),
          };

          if (beforeLayer) {
            layerConfig.beforeLayer = beforeLayer;
          }

          map.addLayer(layerConfig);
        } catch (error) {
          console.error('[Visited Layer] Error adding layer:', error);
        }
      });
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
      
      // Handle individual gym clicks
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
  
  // Track retry attempts to prevent infinite loops
  // Reset retry count when style changes
  let addGymsLayerRetryCount = 0;
  const MAX_ADD_GYMS_RETRIES = 5; // Increased from 3 to 5 for style changes
  
  // Reset retry count when map style changes
  map.on('style.load', () => {
    addGymsLayerRetryCount = 0; // Reset retry count on style load
  });
  
  function addGymsLayer(geojson, onClick, votedIds = [], retryCount = 0) {
    // Prevent infinite retries
    if (retryCount >= MAX_ADD_GYMS_RETRIES) {
      console.error('[MapLayers] Max retries reached for addGymsLayer, aborting');
      return;
    }
    
    // Validate container and data
    if (!map.getContainer() || !map.getContainer().offsetWidth) {
      if (retryCount < MAX_ADD_GYMS_RETRIES) {
        map.once('load', () => addGymsLayer(geojson, onClick, votedIds, retryCount + 1));
      } else {
        console.error('[MapLayers] Container not ready after max retries');
      }
      return;
    }

    if (!geojson || !geojson.features || !Array.isArray(geojson.features) || geojson.features.length === 0) {
      console.error('[MapLayers] Invalid or empty GeoJSON provided to addGymsLayer');
      return;
    }

    // Ensure style is loaded before adding layers
    if (!map.isStyleLoaded()) {
      if (retryCount < MAX_ADD_GYMS_RETRIES) {
        // Wait for style to load, with a delay to ensure it's fully ready
        map.once('style.load', () => {
          // Add delay to ensure style is fully initialized
          setTimeout(() => {
            addGymsLayer(geojson, onClick, votedIds, retryCount + 1);
          }, 300);
        });
      } else {
        console.error('[MapLayers] Style not loaded after max retries, aborting');
        // Try once more after a longer delay as last resort
        setTimeout(() => {
          if (map.isStyleLoaded()) {
            console.log('[MapLayers] Style loaded after delay, retrying once more...');
            addGymsLayer(geojson, onClick, votedIds, retryCount);
          }
        }, 2000);
      }
      return;
    }
    
    // Reset retry count on successful start
    addGymsLayerRetryCount = 0;

    try {
      const preparedGeoJSON = prepareGeoJSON(geojson, votedIds);
      setupSources(preparedGeoJSON);
      removeLayersIfExist();

      // Add layers in order: heatmap -> circles -> labels -> visited icons
      addHeatmapLayer();
      
      // Add circles layer, then add visited layer after circles is confirmed
      addCirclesLayer((circlesAdded) => {
        if (circlesAdded) {
          addLabelsLayer();
          setupEventHandlers(onClick);
          // Add visited layer after circles layer is confirmed to exist
          addVisitedLayer();
        } else {
          console.warn('[MapLayers] Circles layer not added, skipping visited layer');
          addLabelsLayer();
          setupEventHandlers(onClick);
        }
      });
    } catch (error) {
      console.error('[MapLayers] Error adding gyms layers:', error);
      // Retry if style wasn't ready (with retry limit)
      if (!map.isStyleLoaded() && retryCount < MAX_ADD_GYMS_RETRIES) {
        map.once('style.load', () => addGymsLayer(geojson, onClick, votedIds, retryCount + 1));
      } else {
        console.error('[MapLayers] Cannot retry - max retries reached or style is loaded');
      }
    }
  }

  function setMode(mode) {
    if (mode !== 'stinky' && mode !== 'difficulty') {
      console.warn('[MapLayers] Invalid mode:', mode);
      return;
    }

    const previousMode = currentMode;
    currentMode = mode;

    // Update heatmap visibility and animation
    if (map.getLayer('gyms-heatmap')) {
      const willBeVisible = mode === 'stinky';
      const wasVisible = previousMode === 'stinky';
      
      map.setLayoutProperty(
        'gyms-heatmap',
        'visibility',
        willBeVisible ? 'visible' : 'none'
      );
      
      // Start/stop animation based on visibility
      if (willBeVisible && !wasVisible && HEATMAP_CONFIG.ANIMATION.ENABLED) {
        animationStartTime = null; // Reset animation timer
        startHeatmapAnimation();
      } else if (!willBeVisible && wasVisible) {
        stopHeatmapAnimation();
      }
    }

    // Update circle radius
    if (map.getLayer('gyms-circles')) {
      map.setPaintProperty(
        'gyms-circles',
        'circle-radius',
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
