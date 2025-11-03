// Zustand store for app state
import { create } from 'https://esm.sh/zustand@4.5.7';
import { getUsername as getStoredUsername, setUsername as setStoredUsername, getUserId as getStoredUserId, setUserId as setStoredUserId, getPassword as getStoredPassword, setPassword as setStoredPassword } from '../lib/username.js';

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
    const userId = getStoredUserId();
    const username = getStoredUsername();
    const password = getStoredPassword();
    set({ userId, username, password });
  },
  
  // Login/Register actions
  login: (userId, username, password = null) => {
    setStoredUserId(userId);
    setStoredUsername(username);
    if (password) {
      setStoredPassword(password);
    }
    set({ userId, username, password });
  },
  
  // Logout action
  logout: () => {
    // Note: We keep username but clear userId (allows anonymous username-only access)
    // If you want full logout, also clear username:
    // setStoredUsername('');
    // set({ userId: null, username: null, password: null });
    setStoredUserId('');
    set({ userId: null, password: null });
  },
  
  // Update password
  setPassword: (password) => {
    if (password) {
      setStoredPassword(password);
      set({ password });
    }
  },
  
  // Check if user is logged in (has userId)
  isLoggedIn: () => {
    return !!get().userId;
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
  };
};

// Initialize auth state on store creation
useAppStore.getState().initAuth();

