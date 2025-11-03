// Centralized error handling utilities

/**
 * Error types for categorization
 */
export const ErrorType = {
  NETWORK: 'NETWORK',
  API: 'API',
  VALIDATION: 'VALIDATION',
  AUTH: 'AUTH',
  MAP: 'MAP',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Custom error class with type and context
 */
export class AppError extends Error {
  constructor(message, type = ErrorType.UNKNOWN, context = {}) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Create network error
 * @param {string} message - Error message
 * @param {Object} context - Additional context
 * @returns {AppError} Network error
 */
export function createNetworkError(message, context = {}) {
  return new AppError(message, ErrorType.NETWORK, context);
}

/**
 * Create API error
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @param {Object} context - Additional context
 * @returns {AppError} API error
 */
export function createApiError(message, status, context = {}) {
  return new AppError(message, ErrorType.API, { ...context, status });
}

/**
 * Create validation error
 * @param {string} message - Error message
 * @param {Object} context - Additional context
 * @returns {AppError} Validation error
 */
export function createValidationError(message, context = {}) {
  return new AppError(message, ErrorType.VALIDATION, context);
}

/**
 * Create auth error
 * @param {string} message - Error message
 * @param {Object} context - Additional context
 * @returns {AppError} Auth error
 */
export function createAuthError(message, context = {}) {
  return new AppError(message, ErrorType.AUTH, context);
}

/**
 * Create map error
 * @param {string} message - Error message
 * @param {Object} context - Additional context
 * @returns {AppError} Map error
 */
export function createMapError(message, context = {}) {
  return new AppError(message, ErrorType.MAP, context);
}

/**
 * Parse error from unknown source
 * @param {Error|unknown} error - Error to parse
 * @returns {AppError} Parsed error
 */
export function parseError(error) {
  if (error instanceof AppError) {
    return error;
  }
  
  if (error instanceof Error) {
    // Try to determine error type from message
    const message = error.message.toLowerCase();
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return createNetworkError(error.message, { original: error });
    }
    if (message.includes('unauthorized') || message.includes('forbidden')) {
      return createAuthError(error.message, { original: error });
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return createValidationError(error.message, { original: error });
    }
    
    return new AppError(error.message, ErrorType.UNKNOWN, { original: error });
  }
  
  // Handle non-Error objects
  const message = typeof error === 'string' ? error : 'Unknown error occurred';
  return new AppError(message, ErrorType.UNKNOWN, { original: error });
}

/**
 * Handle error with user-friendly message
 * @param {Error|AppError|unknown} error - Error to handle
 * @param {Object} options - Handling options
 * @param {boolean} options.log - Whether to log error (default: true)
 * @param {boolean} options.showToast - Whether to show toast notification (default: true)
 * @param {Function} options.onError - Custom error handler
 * @returns {string} User-friendly error message
 */
export function handleError(error, options = {}) {
  const {
    log = true,
    showToast = true,
    onError = null,
  } = options;
  
  const appError = parseError(error);
  const userMessage = getUserFriendlyMessage(appError);
  
  // Log error
  if (log) {
    console.error(`[${appError.type}]`, appError.message, appError.context);
  }
  
  // Show toast notification
  if (showToast && typeof window !== 'undefined' && window.toast) {
    window.toast.error(userMessage);
  }
  
  // Call custom handler
  if (onError) {
    onError(appError);
  }
  
  return userMessage;
}

/**
 * Get user-friendly error message
 * @param {AppError} error - Error to format
 * @returns {string} User-friendly message
 */
function getUserFriendlyMessage(error) {
  switch (error.type) {
    case ErrorType.NETWORK:
      return 'Network error. Please check your connection and try again.';
    case ErrorType.API:
      if (error.context.status === 401) {
        return 'Please log in to continue.';
      }
      if (error.context.status === 403) {
        return 'You do not have permission to perform this action.';
      }
      if (error.context.status === 404) {
        return 'Resource not found.';
      }
      if (error.context.status === 500) {
        return 'Server error. Please try again later.';
      }
      return error.message || 'An error occurred. Please try again.';
    case ErrorType.VALIDATION:
      return error.message || 'Invalid input. Please check your data.';
    case ErrorType.AUTH:
      return error.message || 'Authentication failed. Please try again.';
    case ErrorType.MAP:
      return 'Map error. Please refresh the page.';
    default:
      return error.message || 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Safe async wrapper that handles errors
 * @param {Function} fn - Async function to wrap
 * @param {Object} options - Error handling options
 * @returns {Promise} Wrapped function result
 */
export async function safeAsync(fn, options = {}) {
  try {
    return await fn();
  } catch (error) {
    handleError(error, options);
    throw error;
  }
}

/**
 * Error boundary for map operations
 * @param {Function} fn - Function to execute
 * @param {string} operation - Operation name for logging
 * @param {Function} fallback - Fallback function on error
 * @returns {*} Function result or fallback result
 */
export function withErrorBoundary(fn, operation, fallback = null) {
  try {
    return fn();
  } catch (error) {
    const appError = parseError(error);
    console.error(`[Error Boundary] ${operation}:`, appError);
    
    if (fallback) {
      return fallback(appError);
    }
    
    throw appError;
  }
}

/**
 * Retry with error handling
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retries
 * @param {Function} onError - Error handler
 * @returns {Promise} Function result
 */
export async function retryWithErrorHandling(fn, maxRetries = 3, onError = null) {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (onError) {
        onError(error, i, maxRetries);
      }
      
      if (i < maxRetries) {
        // Exponential backoff
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw parseError(lastError);
}

