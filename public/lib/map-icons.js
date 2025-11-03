// Map icon generation utilities

/**
 * Configuration for visited gym icon (red cross)
 */
export const VISITED_GYM_ICON = {
  name: 'visited-cross-icon',
  size: 32,
  lineWidth: 4,
  color: '#dc2626',
};

/**
 * Generate a red cross icon on a canvas
 * @returns {HTMLCanvasElement} Canvas element with drawn cross
 */
export function generateCrossIcon() {
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

/**
 * Load visited icon into MapLibre map
 * @param {maplibregl.Map} map - MapLibre map instance
 * @param {Function} waitForLayer - Function to wait for a layer to exist
 * @param {Function} callback - Callback with success boolean
 * @param {boolean} visitedIconLoaded - Reference to icon loaded state
 */
export function loadVisitedIcon(map, waitForLayer, callback, visitedIconLoaded) {
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

