// Password hashing utilities (for future authentication)
// Note: Requires bcrypt package: npm install bcrypt

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
export async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  
  // Dynamic import to avoid requiring bcrypt if not used
  const bcrypt = await import('bcrypt');
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password to verify
 * @param {string} hash - Hashed password from database
 * @returns {Promise<boolean>} - True if password matches
 */
export async function verifyPassword(password, hash) {
  if (!password || !hash) {
    return false;
  }
  
  try {
    const bcrypt = await import('bcrypt');
    return bcrypt.compare(password, hash);
  } catch (e) {
    return false;
  }
}

/**
 * Check if a user has a password set
 * @param {string|null} passwordHash - Password hash from database
 * @returns {boolean} - True if password is set
 */
export function hasPassword(passwordHash) {
  return passwordHash !== null && passwordHash !== undefined && passwordHash.length > 0;
}

