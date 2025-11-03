// Zustand store for app state
import { create } from 'https://esm.sh/zustand@4.5.7';
import { isValidUsername } from '../lib/validation.js';

// LocalStorage keys
const USERNAME_KEY = 'username';
const USER_ID_KEY = 'user_id';
const PASSWORD_KEY = 'password';

// Safe localStorage access
function getFromStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function setInStorage(key, value) {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Gym object shape
// { id, name, address, tel, image, smell_avg, votes, lng, lat, ... }

export const useAppStore = create((set, get) => ({
  // Selected gym state
  selectedGym: null,
  setSelectedGym: (gym) => set({ selectedGym: gym }),

  // Viewport state
  viewport: null, // { center: [lng, lat], zoom }
  setViewport: (viewport) => set({ viewport }),

  // User location
  userLocation: null, // [lng, lat]
  setUserLocation: (location) => set({ userLocation: location }),

  // Auth state (synced with localStorage)
  userId: null,
  username: null,
  password: null,
  
  // Initialize auth state from localStorage
  initAuth: () => {
    const userId = getFromStorage(USER_ID_KEY);
    const username = getFromStorage(USERNAME_KEY);
    const password = getFromStorage(PASSWORD_KEY);
    set({ userId, username, password });
  },
  
  // Login/Register actions
  login: (userId, username, password = null) => {
    if (userId) setInStorage(USER_ID_KEY, userId);
    if (username && isValidUsername(username)) {
      setInStorage(USERNAME_KEY, username.trim());
    }
    if (password) {
      setInStorage(PASSWORD_KEY, password);
    }
    set({ userId, username: username?.trim() || null, password });
  },
  
  // Logout action
  logout: () => {
    // Note: We keep username but clear userId (allows anonymous username-only access)
    setInStorage(USER_ID_KEY, '');
    set({ userId: null, password: null });
  },
  
  // Update password
  setPassword: (password) => {
    if (password) {
      setInStorage(PASSWORD_KEY, password);
      set({ password });
    }
  },
  
  // Check if user is logged in (has userId)
  isLoggedIn: () => {
    return !!get().userId;
  },
  
  // Ensure username exists, prompting if needed
  // Returns the username or null if user cancels
  ensureUsername: () => {
    let username = get().username;
    
    if (!username) {
      const currentUsername = getFromStorage(USERNAME_KEY);
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
      
      setInStorage(USERNAME_KEY, trimmed);
      set({ username: trimmed });
      return trimmed;
    }
    
    return username;
  },
}));

// Convenience hook for auth state (works in vanilla JS)
export const useAuth = () => {
  // In vanilla JS, we need to use getState() instead of calling the store directly
  const store = useAppStore.getState();
  return {
    userId: store.userId,
    username: store.username,
    password: store.password,
    isLoggedIn: store.isLoggedIn(),
    login: store.login,
    logout: store.logout,
    setPassword: store.setPassword,
    ensureUsername: store.ensureUsername,
  };
};

// Initialize auth state on store creation
useAppStore.getState().initAuth();

