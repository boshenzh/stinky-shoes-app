// Style switcher control - allows users to switch between different map styles
// Positioned below the zoom controls

// Custom MapLibre control class
class StyleSwitcherControl {
  constructor(options) {
    this.map = options.map;
    this.protomapsApiKey = options.protomapsApiKey;
    // Protomaps API v5 available styles/flavors
    // Based on Protomaps documentation: light, dark, grayscale, white, black
    // Note: Some styles may not be available in all API keys or may need different endpoints
    // For now, only use 'light' which is confirmed to work
    this.styles = [
      { id: 'light', name: 'Light', icon: '🌞' },
      { id: 'dark', name: 'Dark', icon: '🌙' },
      // Note: positron and voyager are not available in Protomaps API v5
      // They are from other providers (CartoDB) and would need different endpoints
    ];
    
    // Filter out any styles that fail to load (will be updated dynamically)
    this.availableStyles = [...this.styles];
    this.currentStyleIndex = 0;
    this._container = null;
  }

  onAdd(map) {
    this.map = map;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'maplibregl-ctrl-icon';
    button.style.fontSize = '18px';
    button.style.lineHeight = '1';
    button.style.padding = '6px';
    button.style.width = '29px';
    button.style.height = '29px';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.title = `Switch style (Current: ${this.availableStyles[this.currentStyleIndex].name})`;
    button.textContent = this.availableStyles[this.currentStyleIndex].icon;
    
    this.button = button;
    
    // Initialize current style
    this.updateButton();
    
    // Setup click handler
    button.addEventListener('click', () => this.switchStyle());
    
    this._container.appendChild(button);
    return this._container;
  }

  onRemove() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._container = null;
    this.button = null;
  }

  getCurrentStyleId() {
    try {
      const style = this.map.getStyle();
      if (!style) return 'light';
      
      // Try to detect style from sprite URL
      const sprite = style.sprite;
      if (typeof sprite === 'string') {
        if (sprite.includes('dark')) return 'dark';
        if (sprite.includes('positron')) return 'positron';
        if (sprite.includes('voyager')) return 'voyager';
        if (sprite.includes('light')) return 'light';
      }
      return 'light'; // default
    } catch (e) {
      return 'light';
    }
  }

  updateButton() {
    if (!this.button) return;
    const styleId = this.getCurrentStyleId();
    this.currentStyleIndex = this.availableStyles.findIndex(s => s.id === styleId);
    if (this.currentStyleIndex === -1) this.currentStyleIndex = 0;
    
    this.button.textContent = this.availableStyles[this.currentStyleIndex].icon;
    this.button.title = `Switch style (Current: ${this.availableStyles[this.currentStyleIndex].name})`;
    
    // Hide button if only one style is available
    if (this.availableStyles.length <= 1 && this._container) {
      this._container.style.display = 'none';
    }
  }

  switchStyle() {
    if (!this.button) return;
    
    // Only cycle through available styles
    if (this.availableStyles.length <= 1) {
      console.warn('Only one style available, cannot switch');
      return;
    }
    
    this.currentStyleIndex = (this.currentStyleIndex + 1) % this.availableStyles.length;
    const nextStyle = this.availableStyles[this.currentStyleIndex];
    
    // Show loading state
    this.button.textContent = '⏳';
    this.button.disabled = true;
    
    // Construct Protomaps style URL
    let styleUrl;
    if (this.protomapsApiKey) {
      styleUrl = `https://api.protomaps.com/styles/v5/${nextStyle.id}/en.json?key=${this.protomapsApiKey}`;
    } else {
      // No API key - can't switch styles
      this.button.disabled = false;
      this.updateButton();
      console.warn('Protomaps API key not configured, cannot switch styles');
      return;
    }
    
    // Switch map style
    this.map.setStyle(styleUrl, { diff: false });
    
    // Wait for style to load
    this.map.once('style.load', () => {
      if (this.button) {
        this.button.disabled = false;
        this.updateButton();
      }
      
      // Fire custom event to notify app that style changed
      window.dispatchEvent(new CustomEvent('mapstylechange', { 
        detail: { style: nextStyle.id } 
      }));
    });
    
    // Handle style loading errors
    const errorHandler = (e) => {
      if (this.button) {
        this.button.disabled = false;
        // Remove this style from available styles if it fails
        const styleIndex = this.availableStyles.findIndex(s => s.id === nextStyle.id);
        if (styleIndex !== -1) {
          this.availableStyles.splice(styleIndex, 1);
          console.warn(`Style '${nextStyle.name}' not available, removing from options`);
        }
        // Revert to previous style on error
        this.currentStyleIndex = (this.currentStyleIndex - 1 + this.availableStyles.length) % this.availableStyles.length;
        if (this.currentStyleIndex < 0) this.currentStyleIndex = 0;
        this.updateButton();
        console.error(`Failed to load ${nextStyle.name} style:`, e.error || e.message || 'Unknown error');
      }
    };
    
    this.map.once('error', errorHandler);
    
    // Remove error handler if style loads successfully
    this.map.once('style.load', () => {
      this.map.off('error', errorHandler);
    });
  }
}

export function createStyleSwitcher(map, protomapsApiKey) {
  return new StyleSwitcherControl({ map, protomapsApiKey });
}

