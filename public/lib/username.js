// Username management utility

const USERNAME_KEY = 'username';
const USER_ID_KEY = 'user_id';
const PASSWORD_KEY = 'password'; // Store password temporarily (consider security implications)
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Get the current username from localStorage
 */
export function getUsername() {
  try {
    return localStorage.getItem(USERNAME_KEY);
  } catch (e) {
    return null;
  }
}

/**
 * Set the username in localStorage
 */
export function setUsername(username) {
  if (!username || typeof username !== 'string') return false;
  const trimmed = username.trim();
  if (!isValidUsername(trimmed)) return false;
  try {
    localStorage.setItem(USERNAME_KEY, trimmed);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if a username is valid
 */
export function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  const trimmed = username.trim();
  if (trimmed.length < USERNAME_MIN_LENGTH || trimmed.length > USERNAME_MAX_LENGTH) {
    return false;
  }
  return USERNAME_PATTERN.test(trimmed);
}

/**
 * Prompt user to enter a username
 * Returns the username or null if cancelled/invalid
 */
export function promptUsername(currentUsername = null) {
  const message = currentUsername 
    ? `Enter your username (current: ${currentUsername})`
    : 'Enter a username (3-20 alphanumeric characters, underscore, or hyphen)';
  
  const input = window.prompt(message, currentUsername || '');
  if (input === null) return null; // User cancelled
  
  const trimmed = input.trim();
  if (!isValidUsername(trimmed)) {
    alert(`Invalid username. Must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters and contain only letters, numbers, underscores, or hyphens.`);
    return null;
  }
  
  setUsername(trimmed);
  return trimmed;
}

/**
 * Get the current password from localStorage (temporary)
 */
export function getPassword() {
  try {
    return localStorage.getItem(PASSWORD_KEY);
  } catch (e) {
    return null;
  }
}

/**
 * Set the password in localStorage (temporary, for session)
 */
export function setPassword(password) {
  if (!password || typeof password !== 'string') return false;
  try {
    localStorage.setItem(PASSWORD_KEY, password);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Clear password from localStorage
 */
export function clearPassword() {
  try {
    localStorage.removeItem(PASSWORD_KEY);
  } catch (e) {}
}

/**
 * Ensure username exists, prompting if needed
 * Returns the username or null if user cancels
 */
export function ensureUsername() {
  let username = getUsername();
  
  if (!username) {
    username = promptUsername();
  }
  
  return username;
}

/**
 * Get the current user_id from localStorage
 */
export function getUserId() {
  try {
    return localStorage.getItem(USER_ID_KEY);
  } catch (e) {
    return null;
  }
}

/**
 * Set the user_id in localStorage
 */
export function setUserId(userId) {
  if (!userId || typeof userId !== 'string') return false;
  try {
    localStorage.setItem(USER_ID_KEY, userId);
    return true;
  } catch (e) {
    return false;
  }
}

