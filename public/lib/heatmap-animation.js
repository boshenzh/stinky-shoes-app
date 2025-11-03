// Heatmap animation utilities

/**
 * Create a heatmap animation controller
 * @param {maplibregl.Map} map - MapLibre map instance
 * @param {Object} config - Full HEATMAP_CONFIG object
 * @param {Function} getCurrentMode - Function to get current mode ('stinky' or 'difficulty')
 * @param {Function} onStop - Optional callback when animation stops
 * @returns {Object} Object with start() and stop() methods
 */
export function createHeatmapAnimation(map, config, getCurrentMode, onStop = null) {
  let animationId = null;
  let startTime = null;
  
  function animate() {
    const layer = map.getLayer('gyms-heatmap');
    if (!layer || getCurrentMode() !== 'stinky') {
      stop();
      return;
    }
    
    if (startTime === null) {
      startTime = performance.now();
    }
    
    const elapsed = (performance.now() - startTime) * config.ANIMATION.PULSE_SPEED;
    
    // Create pulsing effect using sine waves (different phases for variety)
    const intensityPulse = Math.sin(elapsed);
    const radiusPulse = Math.sin(elapsed * 0.8 + Math.PI / 4); // Different phase
    const opacityPulse = Math.sin(elapsed * 1.2 - Math.PI / 3); // Different phase
    
    // Calculate animated values
    const animatedIntensity = config.INTENSITY + 
      (intensityPulse * config.ANIMATION.INTENSITY_VARIATION);
    const animatedRadius = config.RADIUS + 
      (radiusPulse * config.ANIMATION.RADIUS_VARIATION);
    const animatedOpacity = config.OPACITY + 
      (opacityPulse * config.ANIMATION.OPACITY_VARIATION);
    
    // Update heatmap properties dynamically with interpolated values
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
      stop();
      return;
    }
    
    animationId = requestAnimationFrame(animate);
  }
  
  function start() {
    if (animationId !== null) return; // Already animating
    
    const layer = map.getLayer('gyms-heatmap');
    if (!layer) return;
    
    startTime = null; // Reset start time
    animate();
  }
  
  function stop() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
      startTime = null;
      if (onStop) onStop();
    }
  }
  
  return { start, stop };
}

