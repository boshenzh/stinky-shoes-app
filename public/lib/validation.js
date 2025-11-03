// Validation utilities

// Username validation
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate username
 * @param {string} username - Username to validate
 * @returns {boolean} True if valid
 */
export function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  const trimmed = username.trim();
  return trimmed.length >= USERNAME_MIN_LENGTH && 
         trimmed.length <= USERNAME_MAX_LENGTH && 
         USERNAME_PATTERN.test(trimmed);
}

// Password validation
export const PASSWORD_MIN_LENGTH = 6;

/**
 * Validate password
 * @param {string} password - Password to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  }
  return { valid: true };
}

// Email validation (optional, for future use)
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_PATTERN.test(email.trim());
}

// Number validation
/**
 * Validate number is within range
 * @param {number} value - Value to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} True if valid
 */
export function isNumberInRange(value, min, max) {
  if (typeof value !== 'number' || isNaN(value)) return false;
  return value >= min && value <= max;
}

/**
 * Validate smell value (0-100)
 * @param {number} value - Smell value
 * @returns {boolean} True if valid
 */
export function isValidSmellValue(value) {
  return isNumberInRange(value, 0, 100);
}

/**
 * Validate difficulty value (-3 to 3)
 * @param {number} value - Difficulty value
 * @returns {boolean} True if valid
 */
export function isValidDifficultyValue(value) {
  return isNumberInRange(value, -3, 3);
}

/**
 * Validate percentage value (0-100)
 * @param {number} value - Percentage value
 * @returns {boolean} True if valid
 */
export function isValidPercentage(value) {
  return isNumberInRange(value, 0, 100);
}

// GeoJSON validation
/**
 * Validate GeoJSON feature
 * @param {Object} feature - GeoJSON feature
 * @returns {boolean} True if valid
 */
export function isValidGeoJSONFeature(feature) {
  if (!feature || typeof feature !== 'object') return false;
  if (feature.type !== 'Feature') return false;
  if (!feature.geometry || !feature.properties) return false;
  if (!feature.geometry.coordinates || !Array.isArray(feature.geometry.coordinates)) return false;
  return true;
}

// URL validation
/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
export function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// General validation helpers
/**
 * Validate non-empty string
 * @param {string} value - Value to validate
 * @param {number} minLength - Minimum length (default: 1)
 * @returns {boolean} True if valid
 */
export function isNonEmptyString(value, minLength = 1) {
  return typeof value === 'string' && value.trim().length >= minLength;
}

/**
 * Validate required field
 * @param {*} value - Value to validate
 * @returns {boolean} True if value exists
 */
export function isRequired(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

