/**
 * Loading Indicator Component
 * 
 * Provides loading spinners and progress indicators
 */

let loadingOverlay = null;

function ensureLoadingOverlay() {
  if (!loadingOverlay) {
    loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loading-overlay';
    loadingOverlay.className = 'fixed inset-0 z-40 bg-black/30 backdrop-blur-sm flex items-center justify-center pointer-events-none hidden';
    loadingOverlay.innerHTML = `
      <div class="bg-white rounded-lg shadow-2xl p-6 flex flex-col items-center gap-4 min-w-[200px] pointer-events-auto">
        <div class="spinner"></div>
        <div class="text-sm font-medium text-gray-700" id="loading-message">Loading...</div>
      </div>
    `;
    
    // Add spinner styles if not already present
    if (!document.getElementById('loading-styles')) {
      const style = document.createElement('style');
      style.id = 'loading-styles';
      style.textContent = `
        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f4f6;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(loadingOverlay);
  }
  return loadingOverlay;
}

/**
 * Show loading overlay with optional message
 */
export function showLoading(message = 'Loading...') {
  const overlay = ensureLoadingOverlay();
  const messageEl = overlay.querySelector('#loading-message');
  if (messageEl) {
    messageEl.textContent = message;
  }
  overlay.classList.remove('hidden');
}

/**
 * Hide loading overlay
 */
export function hideLoading() {
  const overlay = ensureLoadingOverlay();
  overlay.classList.add('hidden');
}

/**
 * Show inline loading spinner (for specific areas)
 */
export function createInlineSpinner(container, message = 'Loading...') {
  const spinnerEl = document.createElement('div');
  spinnerEl.className = 'flex items-center justify-center gap-2 p-4 text-sm text-gray-600';
  spinnerEl.innerHTML = `
    <div class="spinner-small"></div>
    <span>${message}</span>
  `;
  
  // Add small spinner styles if not already present
  if (!document.getElementById('loading-styles')) {
    const style = document.createElement('style');
    style.id = 'loading-styles';
    style.textContent += `
      .spinner-small {
        width: 16px;
        height: 16px;
        border: 2px solid #f3f4f6;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
    `;
    document.head.appendChild(style);
  }
  
  if (container) {
    container.appendChild(spinnerEl);
  }
  
  return spinnerEl;
}

