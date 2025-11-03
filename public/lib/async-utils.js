// Async utility functions (debounce, throttle, retry)

/**
 * Debounce a function call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle a function call
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Initial delay in milliseconds
 * @param {Function} onError - Optional error handler
 * @returns {Promise} Promise that resolves with function result
 */
export async function retry(fn, maxRetries = 3, delay = 1000, onError = null) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (onError) onError(error, i, maxRetries);
      
      if (i < maxRetries) {
        const waitTime = delay * Math.pow(2, i); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  throw lastError;
}

/**
 * Create a request deduplication cache with TTL
 * @param {number} ttl - Time to live in milliseconds (default: 60000 = 1 minute)
 * @returns {Object} Cache object with get/set methods
 */
export function createRequestCache(ttl = 60000) {
  const cache = new Map();
  const pending = new Map();
  const timestamps = new Map();
  
  function isExpired(key) {
    const timestamp = timestamps.get(key);
    if (!timestamp) return true;
    return Date.now() - timestamp > ttl;
  }
  
  function cleanup(key) {
    cache.delete(key);
    timestamps.delete(key);
  }
  
  return {
    get(key) {
      if (isExpired(key)) {
        cleanup(key);
        return undefined;
      }
      return cache.get(key);
    },
    
    async set(key, fn) {
      // If already pending, return the pending promise
      if (pending.has(key)) {
        return pending.get(key);
      }
      
      // Check cache first
      if (!isExpired(key)) {
        const cached = cache.get(key);
        if (cached !== undefined) {
          return Promise.resolve(cached);
        }
      }
      
      // Create new promise
      const promise = fn().then(result => {
        cache.set(key, result);
        timestamps.set(key, Date.now());
        pending.delete(key);
        return result;
      }).catch(error => {
        pending.delete(key);
        throw error;
      });
      
      pending.set(key, promise);
      return promise;
    },
    
    clear() {
      cache.clear();
      pending.clear();
      timestamps.clear();
    },
    
    delete(key) {
      cache.delete(key);
      pending.delete(key);
      timestamps.delete(key);
    },
    
    // Cleanup expired entries
    cleanup() {
      for (const key of cache.keys()) {
        if (isExpired(key)) {
          cleanup(key);
        }
      }
    }
  };
}

