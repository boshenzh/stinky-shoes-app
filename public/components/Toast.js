/**
 * Toast Notification Component
 * 
 * Provides user-friendly toast notifications to replace alert() calls
 * Supports success, error, warning, and info types
 */

let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'fixed top-4 right-4 sm:top-6 sm:right-6 z-50 space-y-2 pointer-events-none';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function createToast(message, type = 'info', duration = 5000) {
  ensureToastContainer();
  
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto min-w-[280px] sm:min-w-[320px] max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-xl border border-gray-200 p-3 sm:p-4 flex items-start gap-2 sm:gap-3 animate-slide-in`;
  
  // Type-specific styling
  const typeConfig = {
    success: {
      icon: '✅',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      iconColor: 'text-green-600',
    },
    error: {
      icon: '❌',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      iconColor: 'text-red-600',
    },
    warning: {
      icon: '⚠️',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      iconColor: 'text-yellow-600',
    },
    info: {
      icon: 'ℹ️',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      iconColor: 'text-blue-600',
    },
  };
  
  const config = typeConfig[type] || typeConfig.info;
  
  // Apply type-specific styles
  toast.classList.add(config.bgColor, config.borderColor);
  
  // Icon
  const iconEl = document.createElement('span');
  iconEl.className = `text-lg flex-shrink-0 ${config.iconColor}`;
  iconEl.textContent = config.icon;
  
  // Message
  const messageEl = document.createElement('div');
  messageEl.className = 'flex-1 text-xs sm:text-sm text-gray-800 leading-relaxed';
  messageEl.textContent = message;
  
  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'flex-shrink-0 text-gray-400 hover:text-gray-600 active:text-gray-800 text-lg p-1 rounded transition-colors';
  closeBtn.innerHTML = '✕';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', () => {
    removeToast(toast);
  });
  
  toast.appendChild(iconEl);
  toast.appendChild(messageEl);
  toast.appendChild(closeBtn);
  
  // Add animation styles if not already present
  if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      @keyframes slide-in {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slide-out {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }
      .animate-slide-in {
        animation: slide-in 0.3s ease-out;
      }
      .animate-slide-out {
        animation: slide-out 0.3s ease-out;
      }
    `;
    document.head.appendChild(style);
  }
  
  return toast;
}

function showToast(message, type = 'info', duration = 5000) {
  const toast = createToast(message, type, duration);
  const container = ensureToastContainer();
  
  container.appendChild(toast);
  
  // Auto-remove after duration
  if (duration > 0) {
    setTimeout(() => {
      removeToast(toast);
    }, duration);
  }
  
  return toast;
}

function removeToast(toast) {
  if (toast && toast.parentNode) {
    toast.classList.add('animate-slide-out');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }
}

// Convenience functions
export const toast = {
  success: (message, duration) => showToast(message, 'success', duration),
  error: (message, duration) => showToast(message, 'error', duration || 7000), // Errors show longer
  warning: (message, duration) => showToast(message, 'warning', duration),
  info: (message, duration) => showToast(message, 'info', duration),
};

